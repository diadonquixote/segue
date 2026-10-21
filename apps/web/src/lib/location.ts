/**
 * Where the user is. The app asks for the position on its own, follows it with
 * a low-power watch, and keeps the last fix on the phone only. When the
 * position isn't available it falls back to the last known area or the
 * device's time zone, and says which.
 */
import { haversineMeters, type LatLng } from '@segue/engine';

export type LocateResult = { ok: true; location: LatLng } | { ok: false; reason: 'denied' | 'unavailable' };
export type LocationPermission = PermissionState | 'unsupported';

/** A real position from the device. Saved on the phone, never sent to the API as is. */
export interface Fix {
  location: LatLng;
  /** ISO time of the fix */
  at: string;
  accuracyM?: number;
  /** the device's time zone when the fix was taken, e.g. "Asia/Manila" */
  zone?: string;
}

/** A watched position is good for this long. */
export const WATCH_MAX_AGE_MS = 5 * 60_000;
/** Save a new fix when the user has moved this far, so small jitter doesn't rewrite storage. */
export const FIX_MOVE_M = 250;
/** …or when the saved fix is this old. */
export const FIX_REFRESH_MS = 5 * 60_000;
/** How long the explanation shows before the browser asks. */
export const EXPLAIN_FIRST_MS = 900;

const hasGeolocation = () => typeof navigator !== 'undefined' && !!navigator.geolocation;

/** Current position, saying whether the user blocked it or it just couldn't be found. `fresh` skips a cached fix. */
export function locate(timeoutMs = 8000, fresh = false): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (!hasGeolocation()) return resolve({ ok: false, reason: 'unavailable' });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (err) => resolve({ ok: false, reason: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: fresh, timeout: timeoutMs, maximumAge: fresh ? 0 : WATCH_MAX_AGE_MS },
    );
  });
}

/** Current position, or null if the user declines or it takes too long. */
export async function currentLocation(timeoutMs = 8000, fresh = false): Promise<LatLng | null> {
  const r = await locate(timeoutMs, fresh);
  return r.ok ? r.location : null;
}

/** Whether the browser will hand over a position without asking. Never prompts. */
export async function locationPermission(): Promise<LocationPermission> {
  if (!hasGeolocation()) return 'unsupported';
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    // Some browsers can't say; asking is the only way to find out.
    return 'prompt';
  }
}

/** Call `onChange` whenever the user changes the location permission. Returns a stop function. */
export function onPermissionChange(onChange: (p: LocationPermission) => void): () => void {
  let stopped = false;
  let status: PermissionStatus | null = null;
  const handler = () => status && onChange(status.state);
  if (hasGeolocation() && navigator.permissions?.query) {
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((s) => {
        if (stopped) return;
        status = s;
        s.addEventListener('change', handler);
      })
      .catch(() => {});
  }
  return () => {
    stopped = true;
    status?.removeEventListener('change', handler);
  };
}

/** The device's time zone name, e.g. "Asia/Manila". */
export function deviceZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Follow the position with a low-power watch. Returns a stop function.
 * A denial stops the watch; a fix that's slow to arrive just keeps waiting.
 */
export function watchLocation(onFix: (fix: Fix) => void, onError: (reason: 'denied' | 'unavailable') => void): () => void {
  if (!hasGeolocation()) {
    onError('unavailable');
    return () => {};
  }
  const zone = deviceZone();
  // Nothing from a stopped watch counts, even if the browser delivers it late.
  let stopped = false;
  let id: number | null = null;
  const stop = () => {
    stopped = true;
    if (id !== null) navigator.geolocation.clearWatch(id);
    id = null;
  };
  id = navigator.geolocation.watchPosition(
    (pos) => {
      if (stopped) return;
      onFix({
        location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        at: new Date(pos.timestamp || Date.now()).toISOString(),
        accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
        ...(zone && { zone }),
      });
    },
    (err) => {
      if (stopped) return;
      const denied = err.code === err.PERMISSION_DENIED;
      if (denied) stop();
      onError(denied ? 'denied' : 'unavailable');
    },
    { enableHighAccuracy: false, maximumAge: WATCH_MAX_AGE_MS, timeout: 30_000 },
  );
  return stop;
}

/** Whether a new fix is worth saving over the last one. */
export function fixWorthKeeping(prev: Fix | undefined, next: Fix): boolean {
  if (!prev) return true;
  if (haversineMeters(prev.location, next.location) >= FIX_MOVE_M) return true;
  return Date.parse(next.at) - Date.parse(prev.at) >= FIX_REFRESH_MS;
}

/** What to do about the position right now, given the permission and whether the tab is on screen. */
export function watchPlan(permission: LocationPermission | 'unknown', visible: boolean): 'watch' | 'explain-then-watch' | 'idle' {
  if (!visible) return 'idle';
  if (permission === 'granted') return 'watch';
  if (permission === 'prompt') return 'explain-then-watch';
  return 'idle';
}

/** A rough area for when there's no position: the main city of a time zone. */
export interface Area {
  name: string;
  location: LatLng;
}

const ZONES: Record<string, [string, number, number]> = {
  'Asia/Manila': ['Manila', 14.6, 120.98],
  'Asia/Singapore': ['Singapore', 1.35, 103.82],
  'Asia/Kuala_Lumpur': ['Kuala Lumpur', 3.14, 101.69],
  'Asia/Jakarta': ['Jakarta', -6.21, 106.85],
  'Asia/Bangkok': ['Bangkok', 13.76, 100.5],
  'Asia/Ho_Chi_Minh': ['Ho Chi Minh City', 10.82, 106.63],
  'Asia/Saigon': ['Ho Chi Minh City', 10.82, 106.63],
  'Asia/Yangon': ['Yangon', 16.84, 96.17],
  'Asia/Hong_Kong': ['Hong Kong', 22.32, 114.17],
  'Asia/Taipei': ['Taipei', 25.03, 121.57],
  'Asia/Shanghai': ['Shanghai', 31.23, 121.47],
  'Asia/Seoul': ['Seoul', 37.57, 126.98],
  'Asia/Tokyo': ['Tokyo', 35.68, 139.69],
  'Asia/Kolkata': ['Kolkata', 22.57, 88.36],
  'Asia/Calcutta': ['Kolkata', 22.57, 88.36],
  'Asia/Kathmandu': ['Kathmandu', 27.72, 85.32],
  'Asia/Dhaka': ['Dhaka', 23.81, 90.41],
  'Asia/Karachi': ['Karachi', 24.86, 67.01],
  'Asia/Dubai': ['Dubai', 25.2, 55.27],
  'Asia/Riyadh': ['Riyadh', 24.71, 46.68],
  'Asia/Tehran': ['Tehran', 35.69, 51.39],
  'Asia/Jerusalem': ['Jerusalem', 31.77, 35.21],
  'Pacific/Guam': ['Guam', 13.44, 144.79],
  'Australia/Perth': ['Perth', -31.95, 115.86],
  'Australia/Adelaide': ['Adelaide', -34.93, 138.6],
  'Australia/Brisbane': ['Brisbane', -27.47, 153.03],
  'Australia/Sydney': ['Sydney', -33.87, 151.21],
  'Australia/Melbourne': ['Melbourne', -37.81, 144.96],
  'Pacific/Auckland': ['Auckland', -36.85, 174.76],
  'Europe/London': ['London', 51.51, -0.13],
  'Europe/Dublin': ['Dublin', 53.35, -6.26],
  'Europe/Lisbon': ['Lisbon', 38.72, -9.14],
  'Europe/Madrid': ['Madrid', 40.42, -3.7],
  'Europe/Paris': ['Paris', 48.86, 2.35],
  'Europe/Amsterdam': ['Amsterdam', 52.37, 4.9],
  'Europe/Berlin': ['Berlin', 52.52, 13.4],
  'Europe/Rome': ['Rome', 41.9, 12.5],
  'Europe/Stockholm': ['Stockholm', 59.33, 18.07],
  'Europe/Warsaw': ['Warsaw', 52.23, 21.01],
  'Europe/Athens': ['Athens', 37.98, 23.73],
  'Europe/Kyiv': ['Kyiv', 50.45, 30.52],
  'Europe/Kiev': ['Kyiv', 50.45, 30.52],
  'Europe/Istanbul': ['Istanbul', 41.01, 28.98],
  'Europe/Moscow': ['Moscow', 55.76, 37.62],
  'Africa/Cairo': ['Cairo', 30.04, 31.24],
  'Africa/Lagos': ['Lagos', 6.52, 3.38],
  'Africa/Nairobi': ['Nairobi', -1.29, 36.82],
  'Africa/Johannesburg': ['Johannesburg', -26.2, 28.05],
  'America/New_York': ['New York', 40.71, -74.01],
  'America/Toronto': ['Toronto', 43.65, -79.38],
  'America/Chicago': ['Chicago', 41.88, -87.63],
  'America/Mexico_City': ['Mexico City', 19.43, -99.13],
  'America/Denver': ['Denver', 39.74, -104.99],
  'America/Phoenix': ['Phoenix', 33.45, -112.07],
  'America/Los_Angeles': ['Los Angeles', 34.05, -118.24],
  'America/Vancouver': ['Vancouver', 49.28, -123.12],
  'America/Anchorage': ['Anchorage', 61.22, -149.9],
  'Pacific/Honolulu': ['Honolulu', 21.31, -157.86],
  'America/Bogota': ['Bogotá', 4.71, -74.07],
  'America/Lima': ['Lima', -12.05, -77.04],
  'America/Santiago': ['Santiago', -33.45, -70.67],
  'America/Sao_Paulo': ['São Paulo', -23.55, -46.63],
  'America/Argentina/Buenos_Aires': ['Buenos Aires', -34.6, -58.38],
  'America/Buenos_Aires': ['Buenos Aires', -34.6, -58.38],
};

/** The main city of a time zone, or undefined for zones that don't point anywhere (UTC) or aren't listed. */
export function areaForZone(zone: string | undefined): Area | undefined {
  const z = zone ? ZONES[zone] : undefined;
  return z ? { name: z[0], location: { lat: z[1], lng: z[2] } } : undefined;
}

/**
 * Where the sky is, and how sure Segue is:
 * - `here`: a position from this session.
 * - `last`: the saved fix, when there's no position now and the phone is still in the same time zone.
 * - `timezone`: the main city of the device's time zone.
 * - `none`: nothing to go on, so no weather claim.
 */
export type SkySource =
  | { kind: 'here'; fix: Fix }
  | { kind: 'last'; fix: Fix }
  | { kind: 'timezone'; area: Area }
  | { kind: 'none' };

export function skySource(opts: { fix?: Fix; live: boolean; zone?: string }): SkySource {
  const { fix, live, zone } = opts;
  if (fix && live) return { kind: 'here', fix };
  // A saved fix from a different time zone is somewhere the user has left.
  if (fix && (!fix.zone || !zone || fix.zone === zone)) return { kind: 'last', fix };
  const area = areaForZone(zone);
  return area ? { kind: 'timezone', area } : { kind: 'none' };
}

/** The location a source points at, if any. */
export function sourceLocation(s: SkySource): LatLng | undefined {
  return s.kind === 'here' || s.kind === 'last' ? s.fix.location : s.kind === 'timezone' ? s.area.location : undefined;
}

/** "Updated 25 min ago" once data is older than `staleMs`; otherwise nothing. */
export function staleNote(at: string | undefined, now: Date, staleMs: number): string | null {
  if (!at) return null;
  const age = now.getTime() - Date.parse(at);
  if (!Number.isFinite(age) || age < staleMs) return null;
  const min = Math.round(age / 60_000);
  if (min < 60) return `Updated ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `Updated ${h} h ago`;
  const d = Math.round(h / 24);
  return `Updated ${d} ${d === 1 ? 'day' : 'days'} ago`;
}

/** About 1 km: what leaves the phone for weather and place names. */
export const coarse = (l: LatLng): LatLng => ({ lat: Math.round(l.lat * 100) / 100, lng: Math.round(l.lng * 100) / 100 });
