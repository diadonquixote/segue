/**
 * The sky behind the app. The API reports current conditions near the user;
 * the last answer is kept on the phone, so the sky still shows offline.
 */
import { haversineMeters, type LatLng } from '@segue/engine';
import { API_URL } from './reroute';
import { moonState, type DayPhase, type MoonState, type SunState } from './sunTimes';

/** Mirrors SkyCondition / CurrentWeather in @segue/providers and the wire schema in @segue/schemas (keep all three in step). */
export type SkyCondition = 'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'rain' | 'heavy-rain' | 'storm';
export const SKY_CONDITIONS: readonly SkyCondition[] = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'rain', 'heavy-rain', 'storm'];

export interface CurrentWeather {
  condition: SkyCondition;
  isDay: boolean;
  temperatureC?: number;
  feelsLikeC?: number;
  uvIndex?: number;
  gustKmh?: number;
  precipitationMm?: number;
  observedAt: string;
  /** the place's offset from UTC in minutes, from its time zone */
  utcOffsetMinutes?: number;
  timezone?: string;
  upcoming?: { time: string; rainChance: number; uvIndex?: number; feelsLikeC?: number }[];
}

/** What's saved on the phone. */
export interface SavedSky {
  weather: CurrentWeather;
  location: LatLng;
  fetchedAt: string;
}

/**
 * What the header draws. `known: false` means a plain sky with no weather claim.
 * The weather gives the condition and temperature; the time of day always
 * comes from the clock and where the sky is (`sun`, `moon`, `phase`).
 */
export interface SkyView {
  condition: SkyCondition;
  /** the sun is above the horizon */
  isDay: boolean;
  phase: DayPhase;
  sun?: SunState;
  moon?: MoonState;
  /** where the moon is on its path, 0 rising → 1 setting */
  moonPath?: number;
  /** the sky is south of the equator */
  southern?: boolean;
  /** the clock offset where the sky is, in minutes from UTC */
  utcOffsetMinutes?: number;
  /** the app is showing a stand-in place (Manila), not where the user is */
  notYours?: boolean;
  temperatureC?: number;
  known: boolean;
  preview?: boolean;
  /** feels-like, UV, wind and the next hours, when known: what precautions are based on */
  details?: CurrentWeather;
}

/** Check the sky again this often while the app is open. */
export const SKY_REFRESH_MS = 20 * 60_000;
/** Older than this, a saved sky is no longer "now". */
export const SKY_STALE_MS = 3 * 60 * 60_000;
/** Moving further than this asks for the sky again. */
const SKY_MOVE_M = 3000;

/** `twilight` is used at dawn and dusk, when the sun is just below the horizon. */
export const SKY_COPY: Record<SkyCondition, { day: string; night: string; twilight?: string; hint: string }> = {
  clear: { day: 'Clear and sunny', night: 'Clear night', twilight: 'Clear sky', hint: 'Good weather for anything outdoors.' },
  'partly-cloudy': { day: 'Partly cloudy', night: 'Partly cloudy', hint: 'Sun and cloud, dry for now.' },
  cloudy: { day: 'Cloudy', night: 'Cloudy night', twilight: 'Cloudy', hint: 'Grey but dry for now.' },
  fog: { day: 'Foggy', night: 'Foggy', hint: "It's hard to see far. Allow extra time on the road." },
  rain: { day: 'Rain', night: 'Rain', hint: 'Outdoor blocks may move indoors when you re-route.' },
  'heavy-rain': { day: 'Heavy rain', night: 'Heavy rain', hint: 'Allow extra travel time. Outdoor blocks may move indoors.' },
  storm: { day: 'Thunderstorm', night: 'Thunderstorm', hint: 'Stay indoors if you can. Re-route to keep the day dry.' },
};


export function needsRefresh(saved: SavedSky | undefined, location: LatLng, now: Date): boolean {
  if (!saved) return true;
  if (now.getTime() - Date.parse(saved.fetchedAt) >= SKY_REFRESH_MS) return true;
  return haversineMeters(saved.location, location) > SKY_MOVE_M;
}

/** Sunrise and sunset happen when the sun's centre is this far below the horizon. */
const SUN_UP = -0.833;

/** The sky to draw: the weather (if recent) under the real time of day. */
export function skyToShow(saved: SavedSky | undefined, now: Date, sun: SunState): SkyView {
  const time = { isDay: sun.elevation > SUN_UP, phase: sun.phase, sun, moon: moonState(now.getTime()) };
  const age = saved ? now.getTime() - Date.parse(saved.fetchedAt) : Infinity;
  if (!saved || age >= SKY_STALE_MS) return { condition: 'clear', ...time, known: false };
  const { condition, temperatureC } = saved.weather;
  return { condition, temperatureC, ...time, known: true, details: saved.weather };
}

/**
 * `?sky=storm` (and `&night=1`) shows any sky, for previews and design checks.
 * `&feels=38&uv=10&gust=60&rainAt=15` adds details, to preview precautions.
 */
export interface SkyPreview {
  condition: SkyCondition;
  /** show it at night: 11 PM where the sky is */
  night?: boolean;
  details?: CurrentWeather;
}

export function skyPreview(search: string, now = new Date()): SkyPreview | null {
  const params = new URLSearchParams(search);
  const sky = params.get('sky');
  if (!sky || !SKY_CONDITIONS.includes(sky as SkyCondition)) return null;
  const condition = sky as SkyCondition;
  const night = params.get('night') === '1';
  const isDay = !night;
  const num = (k: string) => (params.has(k) && Number.isFinite(Number(params.get(k))) ? Number(params.get(k)) : undefined);
  const feels = num('feels');
  const uv = num('uv');
  const gust = num('gust');
  const rainAt = num('rainAt');
  const base: SkyPreview = night ? { condition, night } : { condition };
  if (feels === undefined && uv === undefined && gust === undefined && rainAt === undefined) return base;
  const upcoming =
    rainAt === undefined
      ? undefined
      : Array.from({ length: 12 }, (_, i) => {
          const t = new Date(now);
          t.setMinutes(0, 0, 0);
          t.setHours(t.getHours() + i);
          return { time: t.toISOString(), rainChance: t.getHours() >= rainAt ? 80 : 5, uvIndex: uv };
        });
  return { ...base, details: { condition, isDay, feelsLikeC: feels, uvIndex: uv, gustKmh: gust, observedAt: now.toISOString(), upcoming } };
}

export async function fetchCurrentWeather(location: LatLng, timeoutMs = 6000): Promise<CurrentWeather | null> {
  // About 1 km is plenty for weather, and the exact position stays on the phone.
  const params = new URLSearchParams({ lat: location.lat.toFixed(2), lng: location.lng.toFixed(2) });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}/v1/weather/now?${params}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { now?: CurrentWeather };
    return body.now && SKY_CONDITIONS.includes(body.now.condition) ? body.now : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The weather in words for the time of day: "Clear and sunny", "Clear sky" at dusk, "Clear night". */
export function skyWords(sky: Pick<SkyView, 'condition' | 'isDay' | 'phase'>): string {
  const copy = SKY_COPY[sky.condition];
  if (sky.phase === 'dawn' || sky.phase === 'dusk') return copy.twilight ?? copy.night;
  return sky.isDay ? copy.day : copy.night;
}

/**
 * The clock offset where the sky is, for its sunrise and local hours: the
 * place's own time zone from the weather when known; the device's when it's
 * the user's own location; otherwise an estimate from the longitude.
 */
export function skyUtcOffset(opts: { saved?: SavedSky; location: LatLng; yours: boolean; deviceOffset: number }): number {
  const { saved, location } = opts;
  const sameArea = saved && haversineMeters(saved.location, location) <= 50_000;
  if (sameArea && saved.weather.utcOffsetMinutes !== undefined) return saved.weather.utcOffsetMinutes;
  if (opts.yours) return opts.deviceOffset;
  return Math.round(location.lng / 15) * 60;
}
