import {
  BudgetedPlacesProvider,
  CachedGeocoder,
  CachedWeatherProvider,
  FallbackWeatherProvider,
  MetNoProvider,
  NoGeocoder,
  NominatimGeocoder,
  CachedPlacesProvider,
  FallbackPlacesProvider,
  GooglePlacesProvider,
  MockPlacesProvider,
  OpenMeteoProvider,
  OsmPlacesProvider,
  type PlacesProvider,
  type WeatherProvider,
} from '@segue/providers';
import type { Config } from './config';

/**
 * Wire up the Places Gateway from config:
 *   google → budget cap → falls back to OSM → falls back to mock, all cached
 *   osm    → falls back to mock, cached
 *   mock   → mock only
 */
export function buildPlacesProvider(config: Config): PlacesProvider {
  const mock = new MockPlacesProvider();
  if (config.placesProvider === 'mock') return mock;
  const osm = new OsmPlacesProvider();
  const chain: PlacesProvider[] =
    config.placesProvider === 'google'
      ? [new BudgetedPlacesProvider(new GooglePlacesProvider(config.googlePlacesApiKey!), config.googleDailyBudget), osm, mock]
      : [osm, mock];
  return new CachedPlacesProvider(new FallbackPlacesProvider(chain));
}

/** Place names from OpenStreetMap (Nominatim), cached; none with offline demo data. */
export function buildGeocoder(config: Config) {
  if (config.placesProvider === 'mock') return new NoGeocoder();
  return new CachedGeocoder(new NominatimGeocoder(fetch, process.env.NOMINATIM_USER_AGENT || 'Segue day planner'));
}

/**
 * Open-Meteo first (free, but limited per IP, and shared hosts burn through that), MET Norway when it refuses,
 * all cached so a cell is asked about once per few minutes, not once per visitor.
 * MET Norway asks for a User-Agent that says who is calling; set WEATHER_USER_AGENT to your own contact.
 */
export function buildWeatherProvider(log: (line: string) => void = console.warn): WeatherProvider {
  const userAgent = process.env.WEATHER_USER_AGENT || 'Segue day planner (pdyntechnology@gmail.com)';
  const chain = new FallbackWeatherProvider(new OpenMeteoProvider(), new MetNoProvider(fetch, userAgent), 5 * 60 * 1000, Date.now, (e) =>
    log(`weather: ${e.message}; using MET Norway for a few minutes`),
  );
  return new CachedWeatherProvider(chain);
}
