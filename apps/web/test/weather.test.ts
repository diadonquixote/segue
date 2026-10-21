import { describe, expect, it } from 'vitest';
import { sunState } from '../src/lib/sunTimes';
import { previewMinutes, previewMoment, SKY_REFRESH_MS, SKY_STALE_MS, needsRefresh, skyPreview, skyToShow, type SavedSky } from '../src/lib/weather';

const MANILA = { lat: 14.5995, lng: 120.9842 };
const now = new Date('2026-10-19T14:00:00+08:00');
const noon = sunState(now.getTime(), MANILA.lat, MANILA.lng, 480);
const saved = (ageMs: number, location = MANILA): SavedSky => ({
  weather: { condition: 'rain', isDay: true, temperatureC: 26.6, observedAt: now.toISOString() },
  location,
  fetchedAt: new Date(now.getTime() - ageMs).toISOString(),
});

describe('the sky', () => {
  it('shows the saved weather while it is recent', () => {
    const view = skyToShow(saved(10 * 60_000), now, noon);
    expect(view).toMatchObject({ condition: 'rain', isDay: true, temperatureC: 26.6, known: true });
    expect(view.details?.observedAt).toBe(now.toISOString());
  });

  it('takes the time of day from the clock, not from a saved reading', () => {
    const at530 = new Date('2026-10-20T17:30:00+08:00');
    const daySaved: SavedSky = {
      weather: { condition: 'clear', isDay: true, temperatureC: 30, observedAt: at530.toISOString() },
      location: MANILA,
      fetchedAt: at530.toISOString(),
    };
    const at8pm = new Date('2026-10-20T20:00:00+08:00');
    const view = skyToShow(daySaved, at8pm, sunState(at8pm.getTime(), MANILA.lat, MANILA.lng, 480));
    expect(view).toMatchObject({ known: true, condition: 'clear', isDay: false, phase: 'night', temperatureC: 30 });
  });

  it('judges freshness by the real clock even when a preview moves the sky to another time', () => {
    const fresh = saved(10 * 60_000);
    const evening = new Date(now.getTime() + 7 * 3_600_000);
    const view = skyToShow(fresh, now, sunState(evening.getTime(), MANILA.lat, MANILA.lng, 480), evening);
    expect(view).toMatchObject({ known: true, temperatureC: 26.6, phase: 'night' });
  });

  it('makes no weather claim once the saved sky is stale', () => {
    expect(skyToShow(saved(SKY_STALE_MS), now, noon)).toMatchObject({ condition: 'clear', known: false });
    expect(skyToShow(undefined, now, noon).known).toBe(false);
  });

  it('asks again when the sky is old or the user has moved', () => {
    expect(needsRefresh(undefined, MANILA, now)).toBe(true);
    expect(needsRefresh(saved(60_000), MANILA, now)).toBe(false);
    expect(needsRefresh(saved(SKY_REFRESH_MS), MANILA, now)).toBe(true);
    expect(needsRefresh(saved(60_000), { lat: 14.65, lng: 121.05 }, now)).toBe(true);
  });

  it('previews any sky from the address bar', () => {
    expect(skyPreview('?sky=storm')).toEqual({ condition: 'storm' });
    expect(skyPreview('?sky=heavy-rain&night=1')).toEqual({ condition: 'heavy-rain', night: true, minutes: 23 * 60 });
    expect(skyPreview('?sky=snow')).toBeNull();
    expect(skyPreview('')).toBeNull();
  });
});

describe('previewing any time and place', () => {
  const minutes = (q: string) => previewMinutes(new URLSearchParams(q));

  it('reads &hour= and &time=', () => {
    expect(minutes('hour=17.5')).toBe(17 * 60 + 30);
    expect(minutes('time=17:30')).toBe(17 * 60 + 30);
    expect(minutes('time=05:05')).toBe(5 * 60 + 5);
    expect(minutes('hour=0')).toBe(0);
  });

  it('ignores times that are not times', () => {
    expect(minutes('hour=25')).toBeUndefined();
    expect(minutes('hour=dusk')).toBeUndefined();
    expect(minutes('time=17.30')).toBeUndefined();
    expect(minutes('time=24:00')).toBeUndefined();
    expect(minutes('')).toBeUndefined();
  });

  it('puts it all together, with &night=1 as 11 PM', () => {
    expect(skyPreview('?sky=clear&time=17:30&lat=40.71&lng=-74.01')).toEqual({ condition: 'clear', minutes: 1050, place: { lat: 40.71, lng: -74.01 } });
    expect(skyPreview('?sky=fog&night=1')).toEqual({ condition: 'fog', night: true, minutes: 23 * 60 });
    expect(skyPreview('?sky=clear&lat=200&lng=10')).toEqual({ condition: 'clear' });
    expect(skyPreview('?sky=clear&lat=14.6')).toEqual({ condition: 'clear' });
  });

  it("finds that time today on the place's own clock", () => {
    const now = new Date('2026-10-20T02:00:00Z'); // 10 AM in Manila, 10 PM the day before in New York
    expect(previewMoment(now, 17 * 60 + 30, 480).toISOString()).toBe('2026-10-20T09:30:00.000Z');
    expect(previewMoment(now, 17 * 60 + 30, -240).toISOString()).toBe('2026-10-19T21:30:00.000Z');
  });
});
