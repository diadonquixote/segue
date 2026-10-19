/**
 * The sky behind the app. The API reports current conditions near the user;
 * the last answer is kept on the phone, so the sky still shows offline.
 */
import { haversineMeters, type LatLng } from '@segue/engine';
import { API_URL } from './reroute';

/** Mirrors SkyCondition / CurrentWeather in @segue/providers (the app doesn't depend on that package). */
export type SkyCondition = 'clear' | 'cloudy' | 'rain' | 'heavy-rain' | 'storm';
export const SKY_CONDITIONS: readonly SkyCondition[] = ['clear', 'cloudy', 'rain', 'heavy-rain', 'storm'];

export interface CurrentWeather {
  condition: SkyCondition;
  isDay: boolean;
  temperatureC?: number;
  observedAt: string;
}

/** What's saved on the phone. */
export interface SavedSky {
  weather: CurrentWeather;
  location: LatLng;
  fetchedAt: string;
}

/** What the header draws. `known: false` means a plain sky with no weather claim. */
export interface SkyView {
  condition: SkyCondition;
  isDay: boolean;
  temperatureC?: number;
  known: boolean;
  preview?: boolean;
}

/** Check the sky again this often while the app is open. */
export const SKY_REFRESH_MS = 20 * 60_000;
/** Older than this, a saved sky is no longer "now". */
export const SKY_STALE_MS = 3 * 60 * 60_000;
/** Moving further than this asks for the sky again. */
const SKY_MOVE_M = 3000;

export const SKY_COPY: Record<SkyCondition, { day: string; night: string; hint: string }> = {
  clear: { day: 'Clear and sunny', night: 'Clear night', hint: 'Good weather for anything outdoors.' },
  cloudy: { day: 'Cloudy', night: 'Cloudy night', hint: 'Grey but dry for now.' },
  rain: { day: 'Rain', night: 'Rain', hint: 'Outdoor blocks may move indoors when you re-route.' },
  'heavy-rain': { day: 'Heavy rain', night: 'Heavy rain', hint: 'Allow extra travel time. Outdoor blocks may move indoors.' },
  storm: { day: 'Thunderstorm', night: 'Thunderstorm', hint: 'Stay indoors if you can. Re-route to keep the day dry.' },
};

/** Rough day/night when there's no forecast to ask. */
export function isDaytime(now: Date): boolean {
  const h = now.getHours();
  return h >= 6 && h < 18;
}

export function needsRefresh(saved: SavedSky | undefined, location: LatLng, now: Date): boolean {
  if (!saved) return true;
  if (now.getTime() - Date.parse(saved.fetchedAt) >= SKY_REFRESH_MS) return true;
  return haversineMeters(saved.location, location) > SKY_MOVE_M;
}

export function skyToShow(saved: SavedSky | undefined, now: Date): SkyView {
  const age = saved ? now.getTime() - Date.parse(saved.fetchedAt) : Infinity;
  if (!saved || age >= SKY_STALE_MS) return { condition: 'clear', isDay: isDaytime(now), known: false };
  const { condition, isDay, temperatureC } = saved.weather;
  return { condition, isDay, temperatureC, known: true };
}

/** `?sky=storm` (and `&night=1`) shows any sky, for previews and design checks. */
export function skyPreview(search: string): Pick<SkyView, 'condition' | 'isDay'> | null {
  const params = new URLSearchParams(search);
  const sky = params.get('sky');
  if (!sky || !SKY_CONDITIONS.includes(sky as SkyCondition)) return null;
  return { condition: sky as SkyCondition, isDay: params.get('night') !== '1' };
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
