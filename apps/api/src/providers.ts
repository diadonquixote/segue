import {
  BudgetedPlacesProvider,
  CachedGeocoder,
  NoGeocoder,
  NominatimGeocoder,
  CachedPlacesProvider,
  FallbackPlacesProvider,
  GooglePlacesProvider,
  MockPlacesProvider,
  OpenMeteoProvider,
  OsmPlacesProvider,
  type PlacesProvider,
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

export function buildWeatherProvider() {
  return new OpenMeteoProvider();
}
