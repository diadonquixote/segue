/**
 * OpenStreetMap places via the Overpass API. Free and keyless, so it is the
 * default source and the fallback when a paid provider is over budget.
 */
import type { Place, Requirement } from '@segue/engine';
import { parseOsmOpeningHours } from './osmHours';
import { ProviderError, fetchWithTimeout, type FetchFn, type NearbyRequest, type PlacesProvider, type SearchableCategory } from './types';

const SELECTORS: Record<SearchableCategory, string[]> = {
  cafe: ['["amenity"="cafe"]'],
  cowork: ['["amenity"="coworking_space"]', '["office"="coworking"]'],
  library: ['["amenity"="library"]'],
  restaurant: ['["amenity"="restaurant"]', '["amenity"="fast_food"]', '["amenity"="food_court"]'],
  gym: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]["sport"="fitness"]'],
  park: ['["leisure"="park"]', '["leisure"="garden"]["access"!="private"]'],
  grocery: ['["shop"="supermarket"]', '["shop"="convenience"]', '["shop"="greengrocer"]'],
  mall: ['["shop"="mall"]', '["shop"="department_store"]'],
};

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function buildOverpassQuery(req: NearbyRequest): string {
  const { lat, lng } = req.location;
  const around = `(around:${Math.round(req.radiusM)},${lat.toFixed(6)},${lng.toFixed(6)})`;
  const parts = SELECTORS[req.category].map((sel) => `nwr${sel}${around};`).join('');
  return `[out:json][timeout:10];(${parts});out center tags ${Math.min(80, (req.limit ?? 20) * 3)};`;
}

function attributesFrom(tags: Record<string, string>, category: SearchableCategory): Partial<Record<Requirement, boolean>> {
  const a: Partial<Record<Requirement, boolean>> = {};
  const net = tags.internet_access;
  if (net) a.wifi = ['wlan', 'yes', 'wifi', 'terminal;wlan'].includes(net) ? true : net === 'no' ? false : undefined;
  if (a.wifi === undefined) delete a.wifi;
  if (category === 'park') a.outdoor = true;
  else a.indoor = true;
  if (category === 'restaurant' || category === 'cafe') a.food = true;
  if (tags['socket'] || tags['socket:type2'] || tags['power_supply'] === 'yes') a.power = true;
  return a;
}

function addressFrom(tags: Record<string, string>): string | undefined {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const parts = [street, tags['addr:city'] ?? tags['addr:suburb']].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

export function parseOverpass(elements: OverpassElement[], category: SearchableCategory): Place[] {
  const out: Place[] = [];
  const seen = new Set<string>();
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name ?? tags['name:en'];
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!name || lat === undefined || lon === undefined) continue;
    const key = `${name.toLowerCase()}@${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `osm:${el.type}/${el.id}`,
      name,
      location: { lat, lng: lon },
      category,
      attributes: attributesFrom(tags, category),
      hours: parseOsmOpeningHours(tags.opening_hours),
      address: addressFrom(tags),
      source: 'osm',
    });
  }
  return out;
}

export class OsmPlacesProvider implements PlacesProvider {
  readonly name = 'osm';
  constructor(
    private readonly fetchFn: FetchFn = fetch,
    private readonly endpoint = 'https://overpass-api.de/api/interpreter',
  ) {}

  async nearby(req: NearbyRequest): Promise<Place[]> {
    const res = await fetchWithTimeout(this.fetchFn, this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Segue/0.1 (day planner)' },
      body: `data=${encodeURIComponent(buildOverpassQuery(req))}`,
      timeoutMs: 12_000,
    });
    if (!res.ok) throw new ProviderError(this.name, `Overpass returned ${res.status}`, res.status);
    const json = (await res.json()) as { elements?: OverpassElement[] };
    return parseOverpass(json.elements ?? [], req.category).slice(0, req.limit ?? 20);
  }
}
