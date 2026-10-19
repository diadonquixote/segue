import type { LatLng } from '@segue/engine';

export type LocateResult = { ok: true; location: LatLng } | { ok: false; reason: 'denied' | 'unavailable' };

/** Current position, saying whether the user blocked it or it just couldn't be found. `fresh` skips a cached fix. */
export function locate(timeoutMs = 8000, fresh = false): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve({ ok: false, reason: 'unavailable' });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (err) => resolve({ ok: false, reason: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: fresh, timeout: timeoutMs, maximumAge: fresh ? 0 : 5 * 60_000 },
    );
  });
}

/** Current position, or null if the user declines or it takes too long. */
export async function currentLocation(timeoutMs = 8000, fresh = false): Promise<LatLng | null> {
  const r = await locate(timeoutMs, fresh);
  return r.ok ? r.location : null;
}

/** Whether the browser will hand over a position without asking. Never prompts. */
export async function locationPermission(): Promise<PermissionState | 'unsupported'> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  try {
    return (await navigator.permissions.query({ name: 'geolocation' })).state;
  } catch {
    return 'prompt';
  }
}
