/**
 * Deterministic fake places around any point. Lets the whole app run with no
 * network and no API keys — for demos, tests and offline development.
 */
import type { OpeningHours, Place, Requirement } from '@segue/engine';
import { geohash } from './geohash';
import type { NearbyRequest, PlacesProvider, SearchableCategory } from './types';

const NAMES: Record<SearchableCategory, string[]> = {
  cafe: ['Kape Hub', 'Third Wave Corner', 'Bean There', 'Brew Lab', 'Tasa Café', 'Slow Pour', 'Kapitolyo Roasters', 'Morning Ritual'],
  cowork: ['Desk Collective', 'Hive Workspace', 'Open Floor', 'The Commons'],
  library: ['City Library', 'Reading Room', 'Learning Commons'],
  restaurant: ['Lutong Bahay', 'Silog Station', 'Noodle House', 'Green Bowl', 'Ihaw Grill', 'Pancit Place'],
  gym: ['Iron Box', 'Night Lift', 'Core Studio', 'Pulse Fitness'],
  park: ['Riverside Park', 'Linear Park', 'Community Garden'],
  grocery: ['Daily Mart', 'Fresh Corner', 'Puregold Express', 'Corner Store 24'],
  mall: ['Central Mall', 'Town Center'],
};

const HOURS: Record<SearchableCategory, [string, string][]> = {
  cafe: [['07:00', '22:00'], ['08:00', '20:00'], ['10:00', '02:00'], ['06:00', '18:00']],
  cowork: [['08:00', '22:00'], ['00:00', '24:00']],
  library: [['09:00', '18:00'], ['08:00', '17:00']],
  restaurant: [['10:00', '22:00'], ['06:00', '15:00'], ['11:00', '23:00']],
  gym: [['06:00', '15:00'], ['16:00', '23:00'], ['05:00', '22:00']],
  park: [['00:00', '24:00'], ['05:00', '21:00']],
  grocery: [['07:00', '22:00'], ['00:00', '24:00']],
  mall: [['10:00', '21:00']],
};

/** Small seeded PRNG so the same area always yields the same places. */
function seeded(seedText: string) {
  let h = 2166136261;
  for (let i = 0; i < seedText.length; i++) h = Math.imul(h ^ seedText.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function everyDay(open: string, close: string): OpeningHours {
  if (open === '00:00' && close === '24:00') return { always: true, periods: [] };
  return { periods: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open, close })) };
}

export class MockPlacesProvider implements PlacesProvider {
  readonly name = 'mock';

  async nearby(req: NearbyRequest): Promise<Place[]> {
    const cell = geohash(req.location.lat, req.location.lng, 6);
    const rand = seeded(`${cell}:${req.category}`);
    const names = NAMES[req.category];
    const hours = HOURS[req.category];
    const limit = Math.min(req.limit ?? 20, names.length);
    const out: Place[] = [];
    for (let i = 0; i < limit; i++) {
      const dist = (0.15 + 0.85 * rand()) * req.radiusM * 0.8;
      const angle = rand() * Math.PI * 2;
      const dLat = (dist * Math.cos(angle)) / 111_320;
      const dLng = (dist * Math.sin(angle)) / (111_320 * Math.cos((req.location.lat * Math.PI) / 180));
      const [open, close] = hours[Math.floor(rand() * hours.length)]!;
      const attributes: Partial<Record<Requirement, boolean>> = req.category === 'park' ? { outdoor: true } : { indoor: true };
      if (['cafe', 'cowork', 'library'].includes(req.category)) {
        const r = rand();
        attributes.wifi = r < 0.75 ? true : r < 0.9 ? false : undefined;
        if (attributes.wifi === undefined) delete attributes.wifi;
        attributes.power = rand() < 0.6;
        attributes.quiet = req.category === 'library' || rand() < 0.3;
      }
      if (req.category === 'cafe' || req.category === 'restaurant') attributes.food = true;
      out.push({
        id: `mock:${cell}:${req.category}:${i}`,
        name: names[i]!,
        location: { lat: req.location.lat + dLat, lng: req.location.lng + dLng },
        category: req.category,
        attributes,
        hours: rand() < 0.85 ? everyDay(open, close) : null,
        rating: Math.round((3.6 + rand() * 1.3) * 10) / 10,
        reviewCount: Math.floor(5 + rand() * 900),
        source: 'mock',
      });
    }
    return out;
  }
}
