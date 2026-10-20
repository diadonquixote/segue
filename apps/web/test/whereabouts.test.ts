import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FIX_MOVE_M,
  FIX_REFRESH_MS,
  WATCH_MAX_AGE_MS,
  areaForZone,
  coarse,
  fixWorthKeeping,
  locationPermission,
  onPermissionChange,
  skySource,
  sourceLocation,
  staleNote,
  watchLocation,
  watchPlan,
  type Fix,
} from '../src/lib/location';
import { LOCATION_BLOCKED, LOCATION_UNSUPPORTED, LOCATION_WHY, locationBanner, locationStatus } from '../src/lib/locationStatus';
import { sunState } from '../src/lib/sunTimes';
import { SKY_MOVE_M, SKY_REFRESH_MS, SKY_STALE_MS, needsRefresh, skyPreview, skyPreviewEnabled, skyToShow, weatherQuery, type SavedSky } from '../src/lib/weather';

const MAKATI = { lat: 14.5547, lng: 121.0244 };
/** About `m` metres north of `from`. */
const north = (from: typeof MAKATI, m: number) => ({ lat: from.lat + m / 111_195, lng: from.lng });
const now = new Date('2026-10-20T10:00:00+08:00');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const fixAt = (location = MAKATI, at = now.toISOString(), zone: string | undefined = 'Asia/Manila'): Fix => ({ location, at, ...(zone && { zone }) });

afterEach(() => vi.unstubAllGlobals());

/** A browser with geolocation and a permission answer. */
function browser(state: PermissionState | 'throws' | 'no-geolocation', geolocation: Partial<Geolocation> = {}) {
  const listeners: (() => void)[] = [];
  const status = {
    state,
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('navigator', {
    geolocation: state === 'no-geolocation' ? undefined : { getCurrentPosition: vi.fn(), watchPosition: vi.fn(() => 7), clearWatch: vi.fn(), ...geolocation },
    permissions: {
      query: vi.fn(async () => {
        if (state === 'throws') throw new TypeError('geolocation is not a permission name here');
        return status;
      }),
    },
  });
  return {
    status,
    change(to: PermissionState) {
      status.state = to as typeof state;
      listeners.forEach((fn) => fn());
    },
  };
}

describe('location permission', () => {
  it('reports granted, denied and prompt as the browser says', async () => {
    for (const state of ['granted', 'denied', 'prompt'] as const) {
      browser(state);
      expect(await locationPermission()).toBe(state);
    }
  });

  it('is unsupported without geolocation', async () => {
    browser('no-geolocation');
    expect(await locationPermission()).toBe('unsupported');
  });

  it('treats a browser that cannot say as prompt, so Segue asks', async () => {
    browser('throws');
    expect(await locationPermission()).toBe('prompt');
  });

  it('notices when the user allows location in site settings', async () => {
    const b = browser('denied');
    const seen: string[] = [];
    const stop = onPermissionChange((p) => seen.push(p));
    await Promise.resolve();
    await Promise.resolve();
    b.change('granted');
    expect(seen).toEqual(['granted']);
    stop();
    expect(b.status.removeEventListener).toHaveBeenCalled();
  });

  it('watches straight away when allowed, explains first when it will ask, and never when blocked, unsupported or hidden', () => {
    expect(watchPlan('granted', true)).toBe('watch');
    expect(watchPlan('prompt', true)).toBe('explain-then-watch');
    expect(watchPlan('denied', true)).toBe('idle');
    expect(watchPlan('unsupported', true)).toBe('idle');
    expect(watchPlan('unknown', true)).toBe('idle');
    expect(watchPlan('granted', false)).toBe('idle');
    expect(watchPlan('prompt', false)).toBe('idle');
  });
});

describe('following the user', () => {
  it('watches with low power and accepts a fix up to 5 minutes old', () => {
    const watchPosition = vi.fn(() => 7);
    browser('granted', { watchPosition });
    watchLocation(() => {}, () => {});
    expect(watchPosition).toHaveBeenCalledTimes(1);
    const [, , options] = watchPosition.mock.calls[0] as unknown as [unknown, unknown, PositionOptions];
    expect(options).toMatchObject({ enableHighAccuracy: false, maximumAge: WATCH_MAX_AGE_MS });
    expect(WATCH_MAX_AGE_MS).toBe(5 * 60_000);
  });

  it('hands over each fix with its time and time zone, and stops when asked', () => {
    let success: PositionCallback = () => {};
    const clearWatch = vi.fn();
    browser('granted', {
      watchPosition: vi.fn((ok: PositionCallback) => {
        success = ok;
        return 7;
      }) as unknown as Geolocation['watchPosition'],
      clearWatch,
    });
    const fixes: Fix[] = [];
    const stop = watchLocation((f) => fixes.push(f), () => {});
    success({ coords: { latitude: MAKATI.lat, longitude: MAKATI.lng, accuracy: 40 }, timestamp: now.getTime() } as GeolocationPosition);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({ location: MAKATI, at: now.toISOString(), accuracyM: 40 });
    expect(typeof fixes[0]!.zone).toBe('string');
    stop();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('stops watching when the user says no, and keeps waiting when the position is just slow', () => {
    let failure: PositionErrorCallback = () => {};
    const clearWatch = vi.fn();
    browser('prompt', {
      watchPosition: vi.fn((_ok: PositionCallback, err: PositionErrorCallback) => {
        failure = err!;
        return 7;
      }) as unknown as Geolocation['watchPosition'],
      clearWatch,
    });
    const errors: string[] = [];
    watchLocation(() => {}, (r) => errors.push(r));
    failure({ code: 3, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'timeout' } as GeolocationPositionError);
    expect(errors).toEqual(['unavailable']);
    expect(clearWatch).not.toHaveBeenCalled();
    failure({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' } as GeolocationPositionError);
    expect(errors).toEqual(['unavailable', 'denied']);
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('ignores anything a stopped watch delivers late', () => {
    let success: PositionCallback = () => {};
    let failure: PositionErrorCallback = () => {};
    browser('granted', {
      watchPosition: vi.fn((ok: PositionCallback, err: PositionErrorCallback) => {
        success = ok;
        failure = err!;
        return 7;
      }) as unknown as Geolocation['watchPosition'],
    });
    const seen: string[] = [];
    const stop = watchLocation(() => seen.push('fix'), (r) => seen.push(r));
    stop();
    success({ coords: { latitude: 1, longitude: 2, accuracy: 10 }, timestamp: now.getTime() } as GeolocationPosition);
    failure({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3, message: 'denied' } as GeolocationPositionError);
    expect(seen).toEqual([]);
  });

  it('says unavailable when the browser has no geolocation', () => {
    browser('no-geolocation');
    const errors: string[] = [];
    watchLocation(() => {}, (r) => errors.push(r));
    expect(errors).toEqual(['unavailable']);
  });
});

describe('movement thresholds', () => {
  it('saves a new fix after moving about 250 m or after 5 minutes, not for GPS jitter', () => {
    const prev = fixAt(MAKATI, ago(60_000));
    expect(fixWorthKeeping(undefined, fixAt())).toBe(true);
    expect(fixWorthKeeping(prev, fixAt(north(MAKATI, 50)))).toBe(false);
    expect(fixWorthKeeping(prev, fixAt(north(MAKATI, FIX_MOVE_M + 20)))).toBe(true);
    expect(fixWorthKeeping(fixAt(MAKATI, ago(FIX_REFRESH_MS)), fixAt(north(MAKATI, 10)))).toBe(true);
  });

  it('asks for the weather again after moving more than 3 km', () => {
    const saved: SavedSky = { weather: { condition: 'clear', isDay: true, observedAt: ago(60_000) }, location: MAKATI, fetchedAt: ago(60_000) };
    expect(SKY_MOVE_M).toBe(3000);
    expect(needsRefresh(saved, north(MAKATI, 2500), now)).toBe(false);
    expect(needsRefresh(saved, north(MAKATI, 3500), now)).toBe(true);
  });
});

describe('stale data', () => {
  const sun = sunState(now.getTime(), MAKATI.lat, MAKATI.lng, 480);
  const savedAgo = (ms: number): SavedSky => ({
    weather: { condition: 'rain', isDay: true, temperatureC: 27, observedAt: ago(ms) },
    location: MAKATI,
    fetchedAt: ago(ms),
  });

  it('refreshes after 20 minutes and stops claiming any weather after 3 hours', () => {
    expect(SKY_REFRESH_MS).toBe(20 * 60_000);
    expect(needsRefresh(savedAgo(19 * 60_000), MAKATI, now)).toBe(false);
    expect(needsRefresh(savedAgo(20 * 60_000), MAKATI, now)).toBe(true);
    expect(skyToShow(savedAgo(SKY_STALE_MS - 60_000), now, sun)).toMatchObject({ known: true, condition: 'rain', fetchedAt: ago(SKY_STALE_MS - 60_000) });
    expect(skyToShow(savedAgo(SKY_STALE_MS), now, sun).known).toBe(false);
  });

  it("says how old the data is, but only once it's stale", () => {
    expect(staleNote(ago(5 * 60_000), now, SKY_REFRESH_MS)).toBeNull();
    expect(staleNote(ago(25 * 60_000), now, SKY_REFRESH_MS)).toBe('Updated 25 min ago');
    expect(staleNote(ago(2 * 3_600_000), now, SKY_REFRESH_MS)).toBe('Updated 2 h ago');
    expect(staleNote(ago(3 * 86_400_000), now, SKY_REFRESH_MS)).toBe('Updated 3 days ago');
    expect(staleNote(undefined, now, SKY_REFRESH_MS)).toBeNull();
  });
});

describe('where the sky is when the position is missing', () => {
  it('uses a position from this session first', () => {
    expect(skySource({ fix: fixAt(), live: true, zone: 'Asia/Manila' })).toMatchObject({ kind: 'here' });
  });

  it('falls back to the last known area while the phone is in the same time zone', () => {
    expect(skySource({ fix: fixAt(), live: false, zone: 'Asia/Manila' })).toMatchObject({ kind: 'last' });
    // older saves have no zone: still the best guess
    expect(skySource({ fix: fixAt(MAKATI, now.toISOString(), undefined), live: false, zone: 'Asia/Manila' })).toMatchObject({ kind: 'last' });
  });

  it("uses the time zone instead once the user is somewhere else, and nothing when the zone doesn't point anywhere", () => {
    const tz = skySource({ fix: fixAt(), live: false, zone: 'Asia/Tokyo' });
    expect(tz).toMatchObject({ kind: 'timezone', area: { name: 'Tokyo' } });
    expect(sourceLocation(tz)).toEqual({ lat: 35.68, lng: 139.69 });
    expect(skySource({ live: false, zone: 'Asia/Manila' })).toMatchObject({ kind: 'timezone', area: { name: 'Manila' } });
    expect(skySource({ live: false, zone: 'UTC' })).toEqual({ kind: 'none' });
    expect(skySource({ live: false })).toEqual({ kind: 'none' });
    expect(sourceLocation({ kind: 'none' })).toBeUndefined();
  });

  it('knows the main city of common time zones', () => {
    expect(areaForZone('Europe/London')?.name).toBe('London');
    expect(areaForZone('Australia/Sydney')?.location.lat).toBeLessThan(0);
    expect(areaForZone('Mars/Olympus_Mons')).toBeUndefined();
  });
});

describe('the pin and the banner', () => {
  const base = { permission: 'granted' as const, asking: false, now };

  it("names the place beside the pin and adds the data's age only when stale", () => {
    expect(locationStatus({ ...base, source: { kind: 'here', fix: fixAt() }, name: 'Urdaneta, Makati', weatherAt: ago(60_000) })).toEqual({
      source: 'here',
      label: 'Urdaneta, Makati',
      note: undefined,
      blocked: false,
    });
    expect(locationStatus({ ...base, source: { kind: 'here', fix: fixAt() }, name: 'Urdaneta, Makati', weatherAt: ago(25 * 60_000) }).note).toBe(
      'Updated 25 min ago',
    );
    expect(locationStatus({ ...base, source: { kind: 'here', fix: fixAt() } }).label).toBe('Near you');
  });

  it('says plainly when the sky is a guess', () => {
    const blocked = { ...base, permission: 'denied' as const };
    expect(locationStatus({ ...blocked, source: { kind: 'last', fix: fixAt() }, name: 'Urdaneta, Makati' })).toMatchObject({
      label: 'Urdaneta, Makati',
      note: 'Using your last known area',
      blocked: true,
    });
    expect(locationStatus({ ...blocked, source: { kind: 'timezone', area: areaForZone('Asia/Manila')! } })).toMatchObject({
      source: 'timezone',
      label: 'Manila',
      note: 'Using your time zone',
    });
    expect(locationStatus({ ...blocked, source: { kind: 'none' } })).toMatchObject({ label: 'Location off' });
  });

  it('shows "Finding you" while asking instead of a guess', () => {
    expect(locationStatus({ ...base, permission: 'prompt', asking: true, source: { kind: 'timezone', area: areaForZone('Asia/Manila')! } })).toMatchObject({
      source: 'finding',
      label: 'Finding you…',
    });
  });

  it('shows "Finding you" while the first position is on its way, not the time zone\'s city', () => {
    const tz = { kind: 'timezone' as const, area: areaForZone('Asia/Manila')! };
    expect(locationStatus({ ...base, waiting: true, source: tz })).toMatchObject({ source: 'finding', label: 'Finding you…' });
    expect(locationStatus({ ...base, waiting: false, source: tz })).toMatchObject({ source: 'timezone', label: 'Manila' });
  });

  it('explains before the browser asks, and says how to allow it when blocked', () => {
    const tz = { kind: 'timezone' as const, area: areaForZone('Asia/Manila')! };
    expect(locationBanner({ permission: 'prompt', asking: true, unavailable: false, source: tz })).toEqual({ kind: 'asking', text: LOCATION_WHY });
    expect(LOCATION_WHY).toMatch(/match the sky and plan your day/);
    expect(LOCATION_WHY).toMatch(/stays on this phone/);
    expect(locationBanner({ permission: 'denied', asking: false, unavailable: false, source: tz })).toEqual({ kind: 'blocked', text: LOCATION_BLOCKED });
    expect(LOCATION_BLOCKED).toBe("Allow location to match your sky. Open your browser's site settings, then reload.");
    expect(locationBanner({ permission: 'unsupported', asking: false, unavailable: false, source: tz })).toEqual({ kind: 'unsupported', text: LOCATION_UNSUPPORTED });
    expect(locationBanner({ permission: 'granted', asking: false, unavailable: true, source: tz })?.kind).toBe('unavailable');
    expect(locationBanner({ permission: 'granted', asking: false, unavailable: false, source: { kind: 'here', fix: fixAt() } })).toBeNull();
  });
});

describe('privacy', () => {
  it('sends only a position rounded to about 1 km for the weather', () => {
    const exact = { lat: 14.554712, lng: 121.024438 };
    expect(weatherQuery(exact).toString()).toBe('lat=14.55&lng=121.02');
    expect(coarse(exact)).toEqual({ lat: 14.55, lng: 121.02 });
  });
});

describe('sky previews', () => {
  it('only work while developing or with the explicit flag', () => {
    expect(skyPreviewEnabled({ DEV: true })).toBe(true);
    expect(skyPreviewEnabled({ DEV: false })).toBe(false);
    expect(skyPreviewEnabled({ DEV: false, VITE_ENABLE_SKY_PREVIEW: 'false' })).toBe(false);
    expect(skyPreviewEnabled({ DEV: false, VITE_ENABLE_SKY_PREVIEW: 'true' })).toBe(true);
  });

  it('ignores ?sky=, &time=, &lat= and &lng= in a production build', () => {
    const q = '?sky=storm&time=21:00&lat=40.71&lng=-74.01&feels=40';
    expect(skyPreview(q, now, false)).toBeNull();
    expect(skyPreview(q, now, true)).toMatchObject({ condition: 'storm', minutes: 21 * 60, place: { lat: 40.71, lng: -74.01 } });
  });
});
