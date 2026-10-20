/**
 * Where the sun and moon are, with no network: NOAA's solar position
 * equations (accurate to a minute or two for sunrise and sunset) and the
 * mean synodic month for the moon's phase. Pure: every input is passed in.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;

export type DayPhase = 'night' | 'dawn' | 'golden-hour' | 'day' | 'dusk';

/** Sun heights, in degrees, where the phases change. */
export const PHASE_EDGES = { night: -6, horizon: 0, golden: 6 } as const;

const julianCentury = (ms: number) => (ms / DAY_MS + 2440587.5 - 2451545) / 36525;

/** Declination (degrees) and the equation of time (minutes) at a moment. */
function sunOrbit(ms: number): { declination: number; eqTime: number } {
  const T = julianCentury(ms);
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const declination = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) / RAD;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eqTime =
    4 *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD)) /
    RAD;
  return { declination, eqTime };
}

/** The sun's height above the horizon, in degrees (negative below it). */
export function sunElevation(ms: number, lat: number, lng: number): number {
  const { declination, eqTime } = sunOrbit(ms);
  const utcMin = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / 60_000;
  const solarMin = (((utcMin + eqTime + 4 * lng) % 1440) + 1440) % 1440;
  const hourAngle = solarMin / 4 - 180;
  const cosZenith =
    Math.sin(lat * RAD) * Math.sin(declination * RAD) + Math.cos(lat * RAD) * Math.cos(declination * RAD) * Math.cos(hourAngle * RAD);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) / RAD;
}

export interface SunTimes {
  /** ms; null in polar day or polar night */
  sunrise: number | null;
  sunset: number | null;
  solarNoon: number;
  /** the sun never sets (true) or never rises (false) that day; null on ordinary days */
  polar: 'day' | 'night' | null;
}

/**
 * Sunrise, sunset and solar noon on the local calendar day that contains
 * `ms`, at a place whose clocks are `utcOffsetMinutes` from UTC.
 */
export function sunTimes(ms: number, lat: number, lng: number, utcOffsetMinutes: number): SunTimes {
  const local = new Date(ms + utcOffsetMinutes * 60_000);
  const midnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  let noon = midnightUtc + (720 - 4 * lng) * 60_000;
  // Two passes: the orbit at the guessed noon refines the noon itself.
  for (let i = 0; i < 2; i++) noon = midnightUtc + (720 - 4 * lng - sunOrbit(noon).eqTime) * 60_000;

  const at = (guess: number, sign: -1 | 1): number | 'never' | 'always' => {
    let t = guess;
    for (let i = 0; i < 3; i++) {
      const { declination, eqTime } = sunOrbit(t);
      // 90.833°: the sun's radius plus refraction at the horizon.
      const cosH =
        Math.cos(90.833 * RAD) / (Math.cos(lat * RAD) * Math.cos(declination * RAD)) - Math.tan(lat * RAD) * Math.tan(declination * RAD);
      if (cosH > 1) return 'never';
      if (cosH < -1) return 'always';
      const H = Math.acos(cosH) / RAD;
      t = midnightUtc + (720 - 4 * (lng - sign * H) - eqTime) * 60_000;
    }
    return t;
  };
  const rise = at(noon - 6 * 3_600_000, -1);
  const set = at(noon + 6 * 3_600_000, 1);
  if (typeof rise !== 'number' || typeof set !== 'number') {
    return { sunrise: null, sunset: null, solarNoon: noon, polar: rise === 'always' || set === 'always' ? 'day' : 'night' };
  }
  return { sunrise: rise, sunset: set, solarNoon: noon, polar: null };
}

/** The phase for a sun height; `morning` tells dawn from dusk. */
export function phaseFor(elevation: number, morning: boolean): DayPhase {
  if (elevation < PHASE_EDGES.night) return 'night';
  if (elevation < PHASE_EDGES.horizon) return morning ? 'dawn' : 'dusk';
  if (elevation < PHASE_EDGES.golden) return 'golden-hour';
  return 'day';
}

export interface SunState {
  phase: DayPhase;
  /** degrees above the horizon */
  elevation: number;
  /** before solar noon */
  morning: boolean;
  /** 0 at sunrise, 1 at sunset, outside 0..1 at night; null in polar day or night */
  progress: number | null;
  times: SunTimes;
}

export function sunState(ms: number, lat: number, lng: number, utcOffsetMinutes: number): SunState {
  const times = sunTimes(ms, lat, lng, utcOffsetMinutes);
  const elevation = sunElevation(ms, lat, lng);
  const morning = ms < times.solarNoon;
  const progress = times.sunrise !== null && times.sunset !== null ? (ms - times.sunrise) / (times.sunset - times.sunrise) : null;
  return { phase: phaseFor(elevation, morning), elevation, morning, progress, times };
}

/** A known new moon: 6 Jan 2000, 18:14 UTC. */
const NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14);
export const SYNODIC_DAYS = 29.530588853;

export interface MoonState {
  /** days since the last new moon */
  age: number;
  /** 0 new → 0.5 full → 1 new */
  cycle: number;
  /** lit fraction of the disc, 0..1 */
  illumination: number;
  waxing: boolean;
  name: 'new' | 'waxing crescent' | 'first quarter' | 'waxing gibbous' | 'full' | 'waning gibbous' | 'last quarter' | 'waning crescent';
}

export function moonState(ms: number): MoonState {
  const age = ((((ms - NEW_MOON_MS) / DAY_MS) % SYNODIC_DAYS) + SYNODIC_DAYS) % SYNODIC_DAYS;
  const cycle = age / SYNODIC_DAYS;
  const illumination = (1 - Math.cos(2 * Math.PI * cycle)) / 2;
  const names: MoonState['name'][] = ['new', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full', 'waning gibbous', 'last quarter', 'waning crescent'];
  return { age, cycle, illumination, waxing: cycle < 0.5, name: names[Math.round(cycle * 8) % 8]! };
}

/**
 * Where the moon is on its path across the sky, 0 rising to 1 setting
 * (outside 0..1 when it's below the horizon). The moon crosses the sky about
 * 50 minutes later each day, so it transits at solar noon plus its cycle × 24 h.
 */
export function moonProgress(ms: number, solarNoon: number): number {
  const transit = solarNoon + moonState(ms).cycle * DAY_MS;
  let fromTransit = (ms - transit) % DAY_MS;
  if (fromTransit > DAY_MS / 2) fromTransit -= DAY_MS;
  if (fromTransit < -DAY_MS / 2) fromTransit += DAY_MS;
  return 0.5 + fromTransit / (DAY_MS / 2);
}
