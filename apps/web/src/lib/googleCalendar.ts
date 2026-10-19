/**
 * Google sign-in and Calendar reads, straight from the browser with Google
 * Identity Services. The access token is short-lived (about an hour), stays
 * in memory, and never reaches the Segue API. Scope is read-only.
 */
import { dayBounds, parseEvents, type CalendarEvent, type GoogleEvent } from './calendar';

export const GOOGLE_CLIENT_ID: string | undefined = import.meta.env?.VITE_GOOGLE_CLIENT_ID || undefined;
const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: '' | 'consent' }): void;
}
interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(cfg: {
        client_id: string;
        scope: string;
        callback: (r: TokenResponse) => void;
        error_callback?: (e: { type: string }) => void;
      }): TokenClient;
      hasGrantedAllScopes(r: TokenResponse, scope: string): boolean;
      revoke(token: string, done?: () => void): void;
    };
  };
}
declare global {
  interface Window {
    google?: Gis;
  }
}

export interface GoogleToken {
  value: string;
  expiresAt: number;
}

/** Why a calendar action failed, so the UI can say what to do. */
export class CalendarError extends Error {
  constructor(readonly kind: 'cancelled' | 'denied' | 'expired' | 'network' | 'unavailable') {
    super(kind);
  }
}

let loading: Promise<void> | null = null;

/** Load Google's sign-in script ahead of time, so the sign-in popup can open straight from a tap. */
export function preloadGoogle(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new CalendarError('network'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export const tokenValid = (t: GoogleToken | null): t is GoogleToken => !!t && t.expiresAt - Date.now() > 60_000;

/**
 * Ask Google for a read-only token. Call it straight from a tap: when the
 * script is already loaded the popup opens in the same tick, which keeps
 * popup blockers happy. `consent` shows the full prompt; '' reuses an
 * earlier grant and usually closes on its own.
 */
export function requestToken(prompt: '' | 'consent'): Promise<GoogleToken> {
  return new Promise((resolve, reject) => {
    const open = () => {
      const oauth = window.google!.accounts.oauth2;
      oauth
        .initTokenClient({
          client_id: GOOGLE_CLIENT_ID!,
          scope: SCOPE,
          callback: (r) => {
            if (r.error || !r.access_token) return reject(new CalendarError('denied'));
            if (!oauth.hasGrantedAllScopes(r, SCOPE)) return reject(new CalendarError('denied'));
            resolve({ value: r.access_token, expiresAt: Date.now() + (r.expires_in ?? 3600) * 1000 });
          },
          error_callback: (e) => reject(new CalendarError(e.type === 'popup_closed' ? 'cancelled' : 'unavailable')),
        })
        .requestAccessToken({ prompt });
    };
    if (!GOOGLE_CLIENT_ID) return reject(new CalendarError('unavailable'));
    if (window.google?.accounts?.oauth2) return open();
    preloadGoogle().then(open, reject);
  });
}

/** Today's busy events from the primary calendar. */
export async function fetchTodayEvents(token: GoogleToken, day: Date): Promise<CalendarEvent[]> {
  const { start, end } = dayBounds(day);
  const params = new URLSearchParams({ timeMin: start, timeMax: end, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
  let res: Response;
  try {
    res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { authorization: `Bearer ${token.value}` },
    });
  } catch {
    throw new CalendarError('network');
  }
  if (res.status === 401) throw new CalendarError('expired');
  if (res.status === 403) throw new CalendarError('denied');
  if (!res.ok) throw new CalendarError('network');
  const body = (await res.json()) as { items?: GoogleEvent[] };
  return parseEvents(body.items ?? [], start, end);
}

export function revokeToken(token: GoogleToken | null): void {
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value);
}

/** Plain words for each failure: what happened and what to do. */
export function calendarErrorMessage(e: unknown): string {
  const kind = e instanceof CalendarError ? e.kind : 'network';
  switch (kind) {
    case 'cancelled':
      return 'Google sign-in was closed before it finished. Try again when you are ready.';
    case 'denied':
      return 'Segue needs permission to see your calendar events. Try again and allow access.';
    case 'expired':
      return 'Your Google sign-in has expired. Tap Sync now to sign in again.';
    case 'unavailable':
      return "Couldn't open Google sign-in. Allow pop-ups for this site, then try again.";
    default:
      return "Couldn't reach Google Calendar. Check your connection and try again.";
  }
}
