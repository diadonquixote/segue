import type { LatLng } from '@segue/engine';

/** Current position, or null if the user declines or it takes too long. */
export function currentLocation(timeoutMs = 8000): Promise<LatLng | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60_000 },
    );
  });
}
