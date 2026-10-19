import { describe, expect, it } from 'vitest';
import { SKY_REFRESH_MS, SKY_STALE_MS, needsRefresh, skyPreview, skyToShow, type SavedSky } from '../src/lib/weather';

const MANILA = { lat: 14.5995, lng: 120.9842 };
const now = new Date('2026-10-19T14:00:00+08:00');
const saved = (ageMs: number, location = MANILA): SavedSky => ({
  weather: { condition: 'rain', isDay: true, temperatureC: 26.6, observedAt: now.toISOString() },
  location,
  fetchedAt: new Date(now.getTime() - ageMs).toISOString(),
});

describe('the sky', () => {
  it('shows the saved weather while it is recent', () => {
    const view = skyToShow(saved(10 * 60_000), now);
    expect(view).toMatchObject({ condition: 'rain', isDay: true, temperatureC: 26.6, known: true });
    expect(view.details?.observedAt).toBe(now.toISOString());
  });

  it('makes no weather claim once the saved sky is stale', () => {
    expect(skyToShow(saved(SKY_STALE_MS), now)).toMatchObject({ condition: 'clear', known: false });
    expect(skyToShow(undefined, now).known).toBe(false);
  });

  it('asks again when the sky is old or the user has moved', () => {
    expect(needsRefresh(undefined, MANILA, now)).toBe(true);
    expect(needsRefresh(saved(60_000), MANILA, now)).toBe(false);
    expect(needsRefresh(saved(SKY_REFRESH_MS), MANILA, now)).toBe(true);
    expect(needsRefresh(saved(60_000), { lat: 14.65, lng: 121.05 }, now)).toBe(true);
  });

  it('previews any sky from the address bar', () => {
    expect(skyPreview('?sky=storm')).toEqual({ condition: 'storm', isDay: true });
    expect(skyPreview('?sky=heavy-rain&night=1')).toEqual({ condition: 'heavy-rain', isDay: false });
    expect(skyPreview('?sky=snow')).toBeNull();
    expect(skyPreview('')).toBeNull();
  });
});
