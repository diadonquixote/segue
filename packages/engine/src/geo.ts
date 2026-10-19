import type { LatLng, TravelFn, TravelMode } from './types';

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Speeds and fixed overheads per mode.
 * `local` covers jeepney / tricycle / UV trips that routing data doesn't know:
 * moderate speed plus a waiting buffer.
 */
const MODES: Record<TravelMode, { kmh: number; overheadMin: number }> = {
  walk: { kmh: 4.8, overheadMin: 0 },
  transit: { kmh: 16, overheadMin: 8 },
  drive: { kmh: 22, overheadMin: 5 },
  local: { kmh: 12, overheadMin: 10 },
};

/** Streets aren't straight lines. */
const DETOUR_FACTOR = 1.3;

/** Walking is faster than waiting for a ride over short distances. */
const WALK_CUTOFF_M = 600;

/** Estimated door-to-door minutes, rounded up. 0 when already there. */
export const estimateTravelMinutes: TravelFn = (from, to, mode) => {
  const meters = haversineMeters(from, to) * DETOUR_FACTOR;
  if (meters < 50) return 0;
  const effective: TravelMode = mode !== 'walk' && meters < WALK_CUTOFF_M ? 'walk' : mode;
  const { kmh, overheadMin } = MODES[effective];
  return Math.ceil((meters / 1000 / kmh) * 60 + overheadMin);
};

/** Rush hour, weekdays 7–10 AM and 5–8 PM local: rides take about half as long again. */
export function rushHourFactor(departMs: number, utcOffsetMinutes: number): number {
  const local = new Date(departMs + utcOffsetMinutes * 60_000);
  const day = local.getUTCDay();
  if (day === 0 || day === 6) return 1;
  const h = local.getUTCHours() + local.getUTCMinutes() / 60;
  return (h >= 7 && h < 10) || (h >= 17 && h < 20) ? 1.5 : 1;
}

/** Wraps a travel estimate so rides slow down in rush hour. Walking is never affected. */
export function trafficAware(base: TravelFn, utcOffsetMinutes: number): TravelFn {
  return (from, to, mode, departMs) => {
    const minutes = base(from, to, mode);
    if (departMs === undefined || mode === 'walk' || minutes === 0) return minutes;
    if (base(from, to, 'walk') === minutes) return minutes; // short hops are walked anyway
    return Math.ceil(minutes * rushHourFactor(departMs, utcOffsetMinutes));
  };
}

/** Search radius that makes sense for a travel mode. */
export function searchRadiusMeters(mode: TravelMode): number {
  switch (mode) {
    case 'walk':
      return 1500;
    case 'local':
      return 4000;
    case 'transit':
      return 6000;
    case 'drive':
      return 10000;
  }
}
