import { describe, expect, it } from 'vitest';
import { precautionsFor } from '../src/lib/precautions';
import type { CurrentWeather, SkyView } from '../src/lib/weather';

// 9:00 AM local, whatever the machine's time zone
const morning = new Date(2026, 9, 20, 9, 0);
const at = (h: number) => new Date(2026, 9, 20, h, 0).toISOString();

const sky = (w: Partial<CurrentWeather>): SkyView => {
  const details: CurrentWeather = { condition: 'clear', isDay: true, observedAt: morning.toISOString(), ...w };
  return { condition: details.condition, isDay: details.isDay, phase: details.isDay ? 'day' : 'night', known: true, details };
};
const kinds = (s: SkyView, mode: 'walk' | 'drive' | 'local' | 'transit' = 'walk', now = morning) => precautionsFor(s, { now, mode }).map((p) => p.kind);

describe('weather precautions', () => {
  it('says nothing on a mild, dry day', () => {
    expect(kinds(sky({ feelsLikeC: 26, uvIndex: 3 }))).toEqual([]);
  });

  it('brings an umbrella when it rains, or when rain is likely later', () => {
    expect(kinds(sky({ condition: 'rain' }))).toContain('umbrella');
    const later = precautionsFor(sky({ upcoming: [{ time: at(10), rainChance: 20 }, { time: at(15), rainChance: 70 }] }), { now: morning, mode: 'walk' });
    expect(later[0]).toMatchObject({ kind: 'umbrella', title: 'Bring an umbrella' });
    expect(later[0]!.body).toContain('70% chance');
    expect(kinds(sky({ upcoming: [{ time: at(15), rainChance: 30 }] }))).toEqual([]);
  });

  it('says to drive safely in heavy rain, in words that fit how you travel', () => {
    const drive = precautionsFor(sky({ condition: 'heavy-rain' }), { now: morning, mode: 'drive' });
    expect(drive.map((p) => p.kind)).toEqual(['drive', 'flood', 'umbrella']);
    expect(drive[0]!.title).toBe('Drive safely');
    expect(drive[0]!.body).toContain('headlights');
    expect(precautionsFor(sky({ condition: 'heavy-rain' }), { now: morning, mode: 'local' })[0]!.title).toBe('Ride safely');
    expect(precautionsFor(sky({ condition: 'heavy-rain' }), { now: morning, mode: 'walk' })[0]!.title).toBe('Walk carefully');
    // light rain only matters for drivers
    expect(kinds(sky({ condition: 'rain' }), 'drive')).toContain('drive');
    expect(kinds(sky({ condition: 'rain' }), 'walk')).not.toContain('drive');
  });

  it('puts the storm first', () => {
    expect(kinds(sky({ condition: 'storm' }), 'drive')[0]).toBe('storm');
  });

  it('warns about heat by how hot it feels, including later today', () => {
    const now = precautionsFor(sky({ feelsLikeC: 36 }), { now: new Date(2026, 9, 20, 13), mode: 'walk' });
    expect(now[0]).toMatchObject({ kind: 'heat', level: 'warn', title: 'Drink water, find shade' });
    const later = precautionsFor(sky({ feelsLikeC: 29, upcoming: [{ time: at(13), rainChance: 0, feelsLikeC: 38 }] }), { now: morning, mode: 'walk' });
    expect(later[0]!.body).toMatch(/feel like 38°.*around 1(:00)? PM/);
    const danger = precautionsFor(sky({ feelsLikeC: 44 }), { now: morning, mode: 'walk' });
    expect(danger[0]).toMatchObject({ kind: 'heat', level: 'danger' });
  });

  it('does not call a warm night "go find shade"', () => {
    expect(kinds(sky({ isDay: false, feelsLikeC: 34 }), 'walk', new Date(2026, 9, 20, 22))).toEqual([]);
  });

  it('says to wear sunscreen when UV is high now or soon, but not in a downpour', () => {
    const soon = precautionsFor(sky({ uvIndex: 2, upcoming: [{ time: at(12), rainChance: 0, uvIndex: 10 }] }), { now: morning, mode: 'walk' });
    expect(soon[0]).toMatchObject({ kind: 'sun', title: 'Wear sunscreen', level: 'warn' });
    expect(soon[0]!.body).toContain('very high (10)');
    expect(kinds(sky({ uvIndex: 6 }))).toEqual(['sun']);
    expect(kinds(sky({ condition: 'heavy-rain', uvIndex: 7 }))).not.toContain('sun');
  });

  it('covers wind and cold, and never shows more than four', () => {
    expect(kinds(sky({ gustKmh: 62 }))).toEqual(['wind']);
    expect(kinds(sky({ feelsLikeC: 9, isDay: true }))).toEqual(['cold']);
    expect(precautionsFor(sky({ condition: 'storm', gustKmh: 70, feelsLikeC: 45 }), { now: morning, mode: 'drive' }).length).toBeLessThanOrEqual(4);
  });

  it('makes no claims when the weather is unknown', () => {
    expect(precautionsFor({ condition: 'clear', isDay: true, phase: 'day', known: false }, { now: morning, mode: 'walk' })).toEqual([]);
  });
});
