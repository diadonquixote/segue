import type { LatLng, WeatherHour } from '@segue/engine';
import { ProviderError, fetchWithTimeout, type FetchFn, type WeatherProvider } from './types';

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
}

/** No forecast (e.g. offline): the engine simply ignores weather. */
export class NoWeatherProvider implements WeatherProvider {
  readonly name = 'none';
  async forecast(): Promise<WeatherHour[]> {
    return [];
  }
}
