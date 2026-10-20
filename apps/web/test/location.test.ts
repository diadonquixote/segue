import { afterEach, describe, expect, it, vi } from 'vitest';
import { areaKey, placeNameFor } from '../src/lib/placeName';
import { precautionsFor } from '../src/lib/precautions';
import { skyUtcOffset, type SavedSky, type SkyView } from '../src/lib/weather';

const MANILA = { lat: 14.5995, lng: 120.9842 };
const NEW_YORK = { lat: 40.7128, lng: -74.006 };
const savedAt = (location: typeof MANILA, utcOffsetMinutes?: number): SavedSky => ({
  weather: { condition: 'clear', isDay: true, observedAt: '2026-10-20T04:00:00Z', utcOffsetMinutes },
  location,
  fetchedAt: '2026-10-20T04:00:00Z',
});

describe('whose clock the sky uses', () => {
  it("prefers the place's own time zone from the weather", () => {
    expect(skyUtcOffset({ saved: savedAt(NEW_YORK, -240), location: NEW_YORK, yours: true, deviceOffset: 480 })).toBe(-240);
  });

  it("uses the device's clock for the user's own location when the weather hasn't said", () => {
    expect(skyUtcOffset({ saved: savedAt(MANILA), location: MANILA, yours: true, deviceOffset: 480 })).toBe(480);
  });

  it('estimates from the longitude for a stand-in or far-away place', () => {
    expect(skyUtcOffset({ location: NEW_YORK, yours: false, deviceOffset: 480 })).toBe(-300);
    // weather from somewhere else entirely doesn't count
    expect(skyUtcOffset({ saved: savedAt(MANILA, 480), location: NEW_YORK, yours: false, deviceOffset: 480 })).toBe(-300);
  });
});

describe('a stand-in sky', () => {
  const hot: SkyView = {
    condition: 'clear',
    isDay: true,
    phase: 'day',
    known: true,
    details: { condition: 'clear', isDay: true, feelsLikeC: 39, uvIndex: 10, observedAt: '2026-10-20T05:00:00Z' },
  };

  it("gives no precautions: it isn't the user's weather", () => {
    const now = new Date('2026-10-20T13:00:00+08:00');
    expect(precautionsFor({ ...hot, utcOffsetMinutes: 480 }, { now, mode: 'walk' }).length).toBeGreaterThan(0);
    expect(precautionsFor({ ...hot, utcOffsetMinutes: 480, notYours: true }, { now, mode: 'walk' })).toEqual([]);
  });

  it('judges daytime heat by the clock where the sky is, not the device', () => {
    // 1 PM in Manila is 1 AM in New York: heat advice belongs to Manila's afternoon.
    const now = new Date('2026-10-20T13:00:00+08:00');
    expect(precautionsFor({ ...hot, utcOffsetMinutes: 480 }, { now, mode: 'walk' }).map((p) => p.kind)).toContain('heat');
    expect(precautionsFor({ ...hot, utcOffsetMinutes: -240 }, { now, mode: 'walk' }).map((p) => p.kind)).not.toContain('heat');
  });
});

describe('place names', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks once per area and remembers it', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ name: 'Urdaneta, Makati' })));
    vi.stubGlobal('fetch', fetchSpy);
    const here = { lat: 14.5547, lng: 121.0244 };
    expect(areaKey(here)).toBe('14.55,121.02');
    expect(await placeNameFor(here)).toBe('Urdaneta, Makati');
    expect(await placeNameFor({ lat: 14.5521, lng: 121.0198 })).toBe('Urdaneta, Makati'); // same area
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain('lat=14.55&lng=121.02');
  });

  it('says nothing (and asks again later) when offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(await placeNameFor({ lat: 10.3157, lng: 123.8854 })).toBeUndefined();
  });
});
