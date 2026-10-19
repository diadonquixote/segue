import { describe, expect, it } from 'vitest';
import { isOpenThroughout } from '@segue/engine';
import {
  BudgetedPlacesProvider,
  CachedPlacesProvider,
  FallbackPlacesProvider,
  GooglePlacesProvider,
  MemoryStore,
  MockPlacesProvider,
  OpenMeteoProvider,
  skyFromWmo,
  OsmPlacesProvider,
  buildOverpassQuery,
  geohash,
  parseGoogleHours,
  parseOsmOpeningHours,
  parseOverpass,
  type FetchFn,
  type PlacesProvider,
} from '../src';

const MANILA = { lat: 14.5995, lng: 120.9842 };
const jsonFetch = (body: unknown, status = 200): FetchFn => async () => new Response(JSON.stringify(body), { status });

describe('geohash', () => {
  it('matches the reference encoding', () => {
    expect(geohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });
});

describe('OSM opening_hours', () => {
  it('parses 24/7', () => {
    expect(parseOsmOpeningHours('24/7')).toEqual({ always: true, periods: [] });
  });

  it('parses weekday ranges and overrides', () => {
    const h = parseOsmOpeningHours('Mo-Fr 08:00-20:00; Sa 09:00-14:00; Su off')!;
    expect(h.periods.filter((p) => p.day === 1)).toEqual([{ day: 1, open: '08:00', close: '20:00' }]);
    expect(h.periods.filter((p) => p.day === 6)).toEqual([{ day: 6, open: '09:00', close: '14:00' }]);
    expect(h.periods.some((p) => p.day === 0)).toBe(false);
  });

  it('parses split shifts, wrapping day ranges and lists', () => {
    const h = parseOsmOpeningHours('Fr-Mo 10:00-14:00,17:00-23:00; We,Th 12:00-18:00')!;
    expect(h.periods.filter((p) => p.day === 0)).toHaveLength(2);
    expect(h.periods.filter((p) => p.day === 3)).toEqual([{ day: 3, open: '12:00', close: '18:00' }]);
    expect(h.periods.some((p) => p.day === 2)).toBe(false);
  });

  it('parses rules without days and past-midnight closes', () => {
    const h = parseOsmOpeningHours('18:00-02:00')!;
    expect(h.periods).toHaveLength(7);
    // Monday 23:30 → Tuesday 01:30, Manila time
    expect(isOpenThroughout(h, Date.parse('2026-10-19T23:30:00+08:00'), Date.parse('2026-10-20T01:30:00+08:00'), 480)).toBe(true);
  });

  it('returns null for formats it cannot honour', () => {
    expect(parseOsmOpeningHours('Mo-Fr sunrise-sunset')).toBeNull();
    expect(parseOsmOpeningHours('Jan-Mar Mo-Fr 08:00-12:00')).toBeNull();
    expect(parseOsmOpeningHours('')).toBeNull();
  });
});

describe('OSM provider', () => {
  it('builds an Overpass query for every selector of a category', () => {
    const q = buildOverpassQuery({ location: MANILA, radiusM: 1500, category: 'gym' });
    expect(q).toMatch(/fitness_centre/);
    expect(q).toMatch(/around:1500,14\.599500,120\.984200/);
  });

  it('parses nodes and ways, skipping unnamed and duplicate elements', () => {
    const places = parseOverpass(
      [
        { type: 'node', id: 1, lat: 14.6, lon: 121, tags: { name: 'Kape', amenity: 'cafe', internet_access: 'wlan', opening_hours: 'Mo-Su 07:00-22:00' } },
        { type: 'way', id: 2, center: { lat: 14.61, lon: 121.01 }, tags: { name: 'No Wifi Café', internet_access: 'no' } },
        { type: 'node', id: 3, lat: 14.6, lon: 121, tags: { amenity: 'cafe' } },
        { type: 'node', id: 4, lat: 14.6, lon: 121, tags: { name: 'Kape', amenity: 'cafe' } },
      ],
      'cafe',
    );
    expect(places.map((p) => p.id)).toEqual(['osm:node/1', 'osm:way/2']);
    expect(places[0]!.attributes.wifi).toBe(true);
    expect(places[0]!.hours?.periods).toHaveLength(7);
    expect(places[1]!.attributes.wifi).toBe(false);
    expect(places[1]!.hours).toBeNull();
  });

  it('calls Overpass and surfaces HTTP errors', async () => {
    const ok = new OsmPlacesProvider(jsonFetch({ elements: [{ type: 'node', id: 9, lat: 14.6, lon: 121, tags: { name: 'Gym' } }] }));
    expect((await ok.nearby({ location: MANILA, radiusM: 1000, category: 'gym' }))[0]?.name).toBe('Gym');
    const bad = new OsmPlacesProvider(jsonFetch({}, 429));
    let message = '';
    try {
      await bad.nearby({ location: MANILA, radiusM: 1000, category: 'gym' });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/429/);
  });
});

describe('Google provider', () => {
  it('parses regular opening hours, including 24/7 and midnight closes', () => {
    expect(parseGoogleHours({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] })).toEqual({ always: true, periods: [] });
    const h = parseGoogleHours({
      periods: [{ open: { day: 1, hour: 18, minute: 0 }, close: { day: 2, hour: 0, minute: 0 } }],
    })!;
    expect(h.periods).toEqual([{ day: 1, open: '18:00', close: '24:00' }]);
  });

  it('sends the field mask and maps results', async () => {
    let sent: { url: string; init?: RequestInit } | undefined;
    const fetchFn: FetchFn = async (url, init) => {
      sent = { url, init };
      return new Response(
        JSON.stringify({
          places: [{ id: 'abc', displayName: { text: 'Iron Box' }, location: { latitude: 14.6, longitude: 121 }, rating: 4.5, userRatingCount: 120 }],
        }),
      );
    };
    const p = new GooglePlacesProvider('test-key', fetchFn);
    const out = await p.nearby({ location: MANILA, radiusM: 2000, category: 'gym' });
    expect(sent!.url).toMatch(/searchNearby$/);
    expect((sent!.init!.headers as Record<string, string>)['X-Goog-FieldMask']).toMatch(/regularOpeningHours/);
    expect(out[0]).toMatchObject({ id: 'google:abc', name: 'Iron Box', rating: 4.5, reviewCount: 120, hours: null });

    await p.nearby({ location: MANILA, radiusM: 2000, category: 'cowork' });
    expect(sent!.url).toMatch(/searchText$/);
  });
});

describe('mock provider', () => {
  it('is deterministic and stays within the radius', async () => {
    const m = new MockPlacesProvider();
    const a = await m.nearby({ location: MANILA, radiusM: 1500, category: 'cafe' });
    const b = await m.nearby({ location: MANILA, radiusM: 1500, category: 'cafe' });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(3);
    for (const p of a) {
      const dLat = (p.location.lat - MANILA.lat) * 111_320;
      const dLng = (p.location.lng - MANILA.lng) * 111_320 * Math.cos((MANILA.lat * Math.PI) / 180);
      expect(Math.hypot(dLat, dLng)).toBeLessThanOrEqual(1500);
    }
  });
});

describe('gateway controls', () => {
  const counting = (): PlacesProvider & { calls: number } => {
    const inner = new MockPlacesProvider();
    const p = { name: 'counting', calls: 0, nearby: async (r: Parameters<PlacesProvider['nearby']>[0]) => { p.calls++; return inner.nearby(r); } };
    return p;
  };

  it('serves repeat lookups from cache until the TTL expires', async () => {
    let now = 0;
    const inner = counting();
    const cached = new CachedPlacesProvider(inner, new MemoryStore(100, () => now), 1000);
    const req = { location: MANILA, radiusM: 1500, category: 'cafe' as const };
    await cached.nearby(req);
    await cached.nearby({ ...req, location: { lat: MANILA.lat + 0.0005, lng: MANILA.lng } }); // same cell
    expect(inner.calls).toBe(1);
    expect(cached.hits).toBe(1);
    now = 2000;
    await cached.nearby(req);
    expect(inner.calls).toBe(2);
  });

  it('falls back when the primary fails', async () => {
    const broken: PlacesProvider = { name: 'broken', nearby: async () => { throw new Error('down'); } };
    const chain = new FallbackPlacesProvider([broken, new MockPlacesProvider()]);
    const out = await chain.nearby({ location: MANILA, radiusM: 1000, category: 'gym' });
    expect(out.length).toBeGreaterThan(0);
    expect(chain.lastErrors[0]).toMatch(/broken: down/);
  });

  it('enforces a daily call budget', async () => {
    const budget = new BudgetedPlacesProvider(new MockPlacesProvider(), 2, () => Date.parse('2026-10-19T10:00:00Z'));
    const req = { location: MANILA, radiusM: 1000, category: 'gym' as const };
    await budget.nearby(req);
    await budget.nearby(req);
    let err = '';
    try {
      await budget.nearby(req);
    } catch (e) {
      err = (e as Error).message;
    }
    expect(err).toMatch(/budget/);
    expect(budget.remaining).toBe(0);
  });
});

describe('Open-Meteo', () => {
  it('maps hourly arrays to weather hours in UTC', async () => {
    const w = new OpenMeteoProvider(
      jsonFetch({ hourly: { time: ['2026-10-19T06:00', '2026-10-19T07:00'], precipitation_probability: [10, 80], temperature_2m: [30.1, 29.5] } }),
    );
    const hours = await w.forecast(MANILA);
    expect(hours).toEqual([
      { time: '2026-10-19T06:00:00Z', precipitationProbability: 10, temperatureC: 30.1 },
      { time: '2026-10-19T07:00:00Z', precipitationProbability: 80, temperatureC: 29.5 },
    ]);
    expect(Number.isNaN(Date.parse(hours[0]!.time))).toBe(false);
  });

  it('reads current conditions into one of the five skies', async () => {
    const w = new OpenMeteoProvider(
      jsonFetch({ current: { time: '2026-10-19T11:00', weather_code: 63, precipitation: 1.2, temperature_2m: 26.4, is_day: 0 } }),
    );
    expect(await w.current(MANILA)).toEqual({ condition: 'rain', isDay: false, temperatureC: 26.4, observedAt: '2026-10-19T11:00:00Z' });
  });

  it('rejects a response without a weather code', async () => {
    const w = new OpenMeteoProvider(jsonFetch({ current: { time: '2026-10-19T11:00' } }));
    await expect(w.current(MANILA)).rejects.toThrow(/missing/);
  });
});

describe('skyFromWmo', () => {
  it.each([
    [0, 0, 'clear'],
    [2, 0, 'clear'],
    [3, 0, 'cloudy'],
    [45, 0, 'cloudy'],
    [73, 0, 'cloudy'],
    [51, 0.2, 'rain'],
    [61, 1, 'rain'],
    [63, 5, 'heavy-rain'],
    [65, 0, 'heavy-rain'],
    [80, 0.5, 'rain'],
    [82, 0, 'heavy-rain'],
    [95, 0, 'storm'],
    [99, 12, 'storm'],
  ] as const)('code %i with %f mm is %s', (code, mm, sky) => {
    expect(skyFromWmo(code, mm)).toBe(sky);
  });
});
