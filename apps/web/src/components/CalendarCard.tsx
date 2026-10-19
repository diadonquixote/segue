import { useEffect } from 'react';
import type { CalendarState } from '../lib/calendar';
import { clock } from '../lib/format';
import { GOOGLE_CLIENT_ID, preloadGoogle } from '../lib/googleCalendar';

interface Props {
  calendar: CalendarState;
  today: string;
  busy: boolean;
  error: string | null;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function CalendarCard({ calendar, today, busy, error, onConnect, onSync, onDisconnect }: Props) {
  // Load Google's sign-in script early so the popup opens straight from the tap.
  useEffect(() => {
    if (GOOGLE_CLIENT_ID) preloadGoogle().catch(() => {});
  }, []);

  if (!GOOGLE_CLIENT_ID) {
    // Only developers can fix a missing client id, so only they see this.
    if (!import.meta.env?.DEV) return null;
    return (
      <section className="calendar-card" aria-label="Google Calendar">
        <p className="calendar-head">
          <CalendarIcon />
          <strong>Google Calendar</strong>
        </p>
        <p className="muted small">
          To turn this on, add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>apps/web/.env</code>. The README explains how to get one.
        </p>
      </section>
    );
  }

  const events = calendar.date === today ? calendar.events : [];
  return (
    <section className="calendar-card" aria-label="Google Calendar">
      <p className="calendar-head">
        <CalendarIcon />
        <strong>Google Calendar</strong>
        {calendar.connected && <span className="calendar-status">Connected</span>}
      </p>

      {!calendar.connected ? (
        <>
          <p className="muted small">
            Bring in today's meetings and classes from the calendars you have switched on. Segue plans around them and never changes your calendar.
          </p>
          <button type="button" className="primary" onClick={onConnect} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Google Calendar'}
          </button>
        </>
      ) : (
        <>
          <p className="muted small">
            {calendar.date !== today
              ? 'Not synced today yet. Sync to plan around today’s events.'
              : `${events.length === 0 ? 'No events' : events.length === 1 ? '1 event' : `${events.length} events`} today${
                  calendar.syncedAt ? ` · Synced ${clock(calendar.syncedAt)}` : ''
                }`}
          </p>
          {events.length > 0 && (
            <ul className="calendar-events">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="stave-time">{clock(e.start)}</span>
                  <span className="stave-body">
                    <span className="stave-title">{e.title}</span>
                    <span className="stave-sub">
                      Until {clock(e.end)}
                      {e.location && ` · ${e.location}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="row-actions">
            <button type="button" className="ghost" onClick={onSync} disabled={busy}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" className="text-button" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
