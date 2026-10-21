import type { LatLng, WeatherHour } from '@segue/engine';
import { ProviderError, fetchWithTimeout, type CurrentWeather, type FetchFn, type SkyCondition, type UpcomingHour, type WeatherProvider } from './types';

/**
 * WMO weather code (as Open-Meteo reports it) → one of the skies.
 * 0–1 clear (1 is "mainly clear"), 2 partly cloudy, 3 overcast, 45/48 fog
 * (48 is rime fog), drizzle and rain by intensity, 95+ thunderstorm.
 * Snow reads as cloudy: it's rare where Segue is used and has no sky of its own yet.
 */
export function skyFromWmo(code: number, precipitationMm = 0): SkyCondition {
  if (code >= 95) return 'storm';
  const wet = (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  if (wet) return code === 65 || code === 67 || code === 82 || precipitationMm >= 4 ? 'heavy-rain' : 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code === 2) return 'partly-cloudy';
  return code <= 1 ? 'clear' : 'cloudy';
}

/** "2026-10-20T14:30" on a clock `seconds` from UTC → "2026-10-20T14:30:00+08:00". */
export function withOffset(local: string, seconds: number): string {
  const m = Math.round(seconds / 60);
  const sign = m < 0 ? '-' : '+';
  const abs = Math.abs(m);
  return `${local}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
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
      current: 'weather_code,precipitation,temperature_2m,apparent_temperature,is_day,uv_index,wind_gusts_10m',
      hourly: 'precipitation_probability,uv_index,apparent_temperature',
      forecast_hours: '12',
      // The place's own time zone, so local hours and sunrise belong to where the sky is.
      timezone: 'auto',
    });
    const res = await fetchWithTimeout(this.fetchFn, `${this.endpoint}?${params}`, { timeoutMs: 4000 });
    if (!res.ok) throw new ProviderError(this.name, `current returned ${res.status}`, res.status);
    type Num = number | null | undefined;
    const json = (await res.json()) as {
      current?: {
        time: string;
        weather_code?: Num;
        precipitation?: Num;
        temperature_2m?: Num;
        apparent_temperature?: Num;
        is_day?: Num;
        uv_index?: Num;
        wind_gusts_10m?: Num;
      };
      hourly?: { time: string[]; precipitation_probability?: Num[]; uv_index?: Num[]; apparent_temperature?: Num[] };
      utc_offset_seconds?: number;
      timezone?: string;
    };
    const offset = json.utc_offset_seconds ?? 0;
    const c = json.current;
    if (!c?.time || c.weather_code == null) throw new ProviderError(this.name, 'current conditions missing');
    const h = json.hourly;
    const upcoming: UpcomingHour[] = (h?.time ?? []).map((t, i) => ({
      time: withOffset(t, offset),
      rainChance: h?.precipitation_probability?.[i] ?? 0,
      uvIndex: h?.uv_index?.[i] ?? undefined,
      feelsLikeC: h?.apparent_temperature?.[i] ?? undefined,
    }));
    return {
      condition: skyFromWmo(c.weather_code, c.precipitation ?? 0),
      isDay: c.is_day !== 0,
      temperatureC: c.temperature_2m ?? undefined,
      feelsLikeC: c.apparent_temperature ?? undefined,
      uvIndex: c.uv_index ?? undefined,
      gustKmh: c.wind_gusts_10m ?? undefined,
      precipitationMm: c.precipitation ?? undefined,
      observedAt: withOffset(c.time, offset),
      utcOffsetMinutes: Math.round(offset / 60),
      timezone: json.timezone,
      upcoming,
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
