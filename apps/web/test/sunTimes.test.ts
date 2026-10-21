import { describe, expect, it } from 'vitest';
import { moonProgress, moonState, phaseFor, sunElevation, sunState, sunTimes } from '../src/lib/sunTimes';

const MANILA = { lat: 14.5995, lng: 120.9842, offset: 480 };
/** "HH:MM" on the local clock of a place `offset` minutes from UTC. */
const local = (ms: number | null, offset: number) => (ms === null ? null : new Date(ms + offset * 60_000).toISOString().slice(11, 16));
const minutes = (hhmm: string | null) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) : NaN);
/** Within `tol` minutes of an almanac time. */
const near = (actual: string | null, expected: string, tol = 3) => Math.abs(minutes(actual) - minutes(expected)) <= tol;

describe('sunrise and sunset', () => {
  it.each([
    // place, a moment that day (UTC), lat, lng, UTC offset, almanac sunrise, sunset (local)
    ['Manila', '2026-10-20T04:00:00Z', 14.5995, 120.9842, 480, '05:48', '17:33'],
    ['London, midsummer', '2026-06-21T12:00:00Z', 51.5074, -0.1278, 60, '04:43', '21:21'],
    ['New York, January', '2026-01-15T17:00:00Z', 40.7128, -74.006, -300, '07:17', '16:53'],
    ['Sydney, midsummer', '2026-12-21T00:00:00Z', -33.8688, 151.2093, 660, '05:41', '20:05'],
  ] as const)('%s', (_, at, lat, lng, offset, rise, set) => {
    const t = sunTimes(Date.parse(at), lat, lng, offset);
    expect(near(local(t.sunrise, offset), rise)).toBe(true);
    expect(near(local(t.sunset, offset), set)).toBe(true);
    expect(t.polar).toBeNull();
  });

  it('uses the calendar day where the place is, not the device', () => {
    // 23:30 UTC on 19 Oct is already 20 Oct in Manila.
    const t = sunTimes(Date.parse('2026-10-19T23:30:00Z'), MANILA.lat, MANILA.lng, MANILA.offset);
    expect(new Date(t.sunrise! + MANILA.offset * 60_000).toISOString().slice(0, 10)).toBe('2026-10-20');
  });

  it('knows polar night and midnight sun', () => {
    expect(sunTimes(Date.parse('2026-12-21T12:00:00Z'), 69.65, 18.96, 60)).toMatchObject({ sunrise: null, sunset: null, polar: 'night' });
    expect(sunTimes(Date.parse('2026-06-21T12:00:00Z'), 69.65, 18.96, 120)).toMatchObject({ sunrise: null, polar: 'day' });
  });
});

describe('phase of the day', () => {
  it('maps sun height to a phase', () => {
    expect(phaseFor(-20, true)).toBe('night');
    expect(phaseFor(-3, true)).toBe('dawn');
    expect(phaseFor(-3, false)).toBe('dusk');
    expect(phaseFor(3, true)).toBe('golden-hour');
    expect(phaseFor(3, false)).toBe('golden-hour');
    expect(phaseFor(30, false)).toBe('day');
  });

  it.each([
    ['03:00', 'night'],
    ['05:35', 'dawn'],
    ['06:10', 'golden-hour'],
    ['12:00', 'day'],
    ['17:05', 'golden-hour'],
    ['17:45', 'dusk'],
    ['20:00', 'night'],
  ] as const)('Manila at %s is %s', (hhmm, phase) => {
    const ms = Date.parse(`2026-10-20T${hhmm}:00+08:00`);
    expect(sunState(ms, MANILA.lat, MANILA.lng, MANILA.offset).phase).toBe(phase);
  });

  it('tracks the sun from rise to set', () => {
    const s = sunState(Date.parse('2026-10-20T11:40:00+08:00'), MANILA.lat, MANILA.lng, MANILA.offset);
    expect(s.progress).toBeCloseTo(0.5, 1);
    expect(s.elevation).toBeGreaterThan(60);
    expect(sunElevation(Date.parse('2026-10-20T00:00:00+08:00'), MANILA.lat, MANILA.lng)).toBeLessThan(-30);
  });
});

describe('the moon', () => {
  it('is full and new on the right nights', () => {
    expect(moonState(Date.parse('2026-03-03T11:38:00Z'))).toMatchObject({ name: 'full' });
    expect(moonState(Date.parse('2026-03-03T11:38:00Z')).illumination).toBeGreaterThan(0.98);
    expect(moonState(Date.parse('2026-03-19T01:23:00Z')).illumination).toBeLessThan(0.02);
    expect(moonState(Date.parse('2026-10-26T04:12:00Z')).illumination).toBeGreaterThan(0.98);
  });

  it('waxes before full and wanes after', () => {
    expect(moonState(Date.parse('2026-10-20T12:00:00Z')).waxing).toBe(true);
    expect(moonState(Date.parse('2026-10-29T12:00:00Z')).waxing).toBe(false);
  });

  it('a full moon is highest around midnight', () => {
    const noon = sunTimes(Date.parse('2026-10-26T04:00:00Z'), MANILA.lat, MANILA.lng, MANILA.offset).solarNoon;
    expect(moonProgress(noon + 12 * 3_600_000, noon)).toBeCloseTo(0.5, 1);
  });
});
