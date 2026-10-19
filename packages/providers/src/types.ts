import type { LatLng, Place, PlaceCategory, WeatherHour } from '@segue/engine';

export type SearchableCategory = Exclude<PlaceCategory, 'none'>;

export interface NearbyRequest {
  location: LatLng;
  radiusM: number;
  category: SearchableCategory;
  limit?: number;
}

export interface PlacesProvider {
  readonly name: string;
  nearby(req: NearbyRequest): Promise<Place[]>;
}

export interface WeatherProvider {
  readonly name: string;
  /** Hourly forecast for roughly the next 48 hours. */
  forecast(location: LatLng): Promise<WeatherHour[]>;
}

/** Injectable fetch so providers can be tested without the network. */
export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

export async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...rest, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
