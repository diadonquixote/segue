import type { LatLng, WeatherHour } from '@segue/engine';
import { ProviderError, fetchWithTimeout, type CurrentWeather, type FetchFn, type SkyCondition, type WeatherProvider } from './types';

/**
 * WMO weather code (as Open-Meteo reports it) → one of the five skies.
 * Partly cloudy still counts as clear: the sun is out. Snow and fog read as cloudy.
 */
export function skyFromWmo(code: number, precipitationMm = 0): SkyCondition {
  if (code >= 95) return 'storm';
  const wet = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  if (wet) return code === 65 || code === 67 || code === 82 || precipitationMm >= 4 ? 'heavy-rain' : 'rain';
  return code <= 2 ? 'clear' : 'cloudy';
}

/** Open-Meteo: free, keyless hourly forecast. */
export class OpenMeteoProvider implements WeatherProvider {
  readonly name = 'open-meteo';
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly endpoint = 'https://api.open-meteo.com/v1/forecast',
  ) {}

  async forecast(location: LatLng): Promise<WeatherHour[]> {
    const params = new URLSearchParams({
      latitude: location.lat.toFixed(4),
      longitude: location.lng.toFixed(4),
      hourly: 'precipitation_probability,temperature_2m',
      forecast_days: '2',
      timezone: 'GMT',
    });
    const res = await fetchWithTimeout(this.fetchFn, `${this.endpoint}?${params}`, { timeoutMs: 4000 });
    if (!res.ok) throw new ProviderError(this.name, `forecast returned ${res.status}`, res.status);
    const json = (await res.json()) as {
      hourly?: { time: string[]; precipitation_probability?: (number | null)[]; temperature_2m?: (number | null)[] };
    };
    const h = json.hourly;
    if (!h?.time) return [];
    return h.time.map((t, i) => ({
      time: `${t}:00Z`, // "2026-10-19T06:00" (GMT) → "2026-10-19T06:00:00Z"
      precipitationProbability: h.precipitation_probability?.[i] ?? 0,
      temperatureC: h.temperature_2m?.[i] ?? undefined,
    }));
  }

  async current(location: LatLng): Promise<CurrentWeather> {
    const params = new URLSearchParams({
      latitude: location.lat.toFixed(4),
      longitude: location.lng.toFixed(4),
      current: 'weather_code,precipitation,temperature_2m,is_day',
      timezone: 'GMT',
    });
    const res = await fetchWithTimeout(this.fetchFn, `${this.endpoint}?${params}`, { timeoutMs: 4000 });
    if (!res.ok) throw new ProviderError(this.name, `current returned ${res.status}`, res.status);
    const json = (await res.json()) as {
      current?: { time: string; weather_code?: number | null; precipitation?: number | null; temperature_2m?: number | null; is_day?: number | null };
    };
    const c = json.current;
    if (!c?.time || c.weather_code == null) throw new ProviderError(this.name, 'current conditions missing');
    return {
      condition: skyFromWmo(c.weather_code, c.precipitation ?? 0),
      isDay: c.is_day !== 0,
      temperatureC: c.temperature_2m ?? undefined,
      observedAt: `${c.time}:00Z`,
    };
  }
}

/** No forecast (e.g. offline): the engine simply ignores weather. */
export class NoWeatherProvider implements WeatherProvider {
  readonly name = 'none';
  async forecast(): Promise<WeatherHour[]> {
    return [];
  }

  async current(): Promise<CurrentWeather> {
    throw new ProviderError(this.name, 'no weather provider configured');
  }
}
