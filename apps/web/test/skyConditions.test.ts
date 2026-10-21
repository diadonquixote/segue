import { describe, expect, it } from 'vitest';
import { skyFromWmo } from '@segue/providers';
import { SKY_CONDITION_VALUES } from '@segue/schemas';
import { SKY_LOOK, hexRgb, toneAt } from '../src/lib/skyRenderer';
import { SKY_CONDITIONS, SKY_COPY, skyWords } from '../src/lib/weather';

const PHASES = ['night', 'dawn', 'golden-hour', 'day', 'dusk'] as const;

describe('sky conditions', () => {
  it('match across the app, the providers and the wire schema', () => {
    expect([...SKY_CONDITIONS].sort()).toEqual([...SKY_CONDITION_VALUES].sort());
  });

  it.each([
    [0, 'clear'],
    [1, 'clear'],
    [2, 'partly-cloudy'],
    [3, 'cloudy'],
    [45, 'fog'],
    [48, 'fog'],
    [61, 'rain'],
    [65, 'heavy-rain'],
    [95, 'storm'],
  ] as const)('weather code %i is %s', (code, sky) => {
    expect(skyFromWmo(code)).toBe(sky);
  });

  it('every sky has words and a tone for every phase', () => {
    for (const c of SKY_CONDITIONS) {
      expect(SKY_COPY[c].day).toBeTruthy();
      for (const p of PHASES) expect(SKY_LOOK[c][p].sky).toHaveLength(3);
    }
  });

  it('describes twilight in its own words', () => {
    expect(skyWords({ condition: 'clear', isDay: false, phase: 'dusk' })).toBe('Clear sky');
    expect(skyWords({ condition: 'clear', isDay: true, phase: 'golden-hour' })).toBe('Clear and sunny');
    expect(skyWords({ condition: 'clear', isDay: false, phase: 'night' })).toBe('Clear night');
    expect(skyWords({ condition: 'fog', isDay: true, phase: 'day' })).toBe('Foggy');
  });
});

describe('sky colours through the day', () => {
  const channels = (hex: string) => hexRgb(hex);
  const distance = (a: string, b: string) => Math.max(...channels(a).map((v, i) => Math.abs(v - channels(b)[i]!)));

  it('are each phase at its fullest', () => {
    expect(toneAt('clear', -20, false)).toEqual(SKY_LOOK.clear.night);
    expect(toneAt('clear', -4, true)).toEqual(SKY_LOOK.clear.dawn);
    expect(toneAt('clear', -4, false)).toEqual(SKY_LOOK.clear.dusk);
    expect(toneAt('clear', 3, false)).toEqual(SKY_LOOK.clear['golden-hour']);
    expect(toneAt('clear', 40, false)).toEqual(SKY_LOOK.clear.day);
  });

  it('blend without jumps as the sun moves', () => {
    for (const c of SKY_CONDITIONS) {
      for (const morning of [true, false]) {
        for (let e = -16; e < 16; e += 0.5) {
          const a = toneAt(c, e, morning);
          const b = toneAt(c, e + 0.5, morning);
          for (let i = 0; i < 3; i++) expect(distance(a.sky[i]!, b.sky[i]!)).toBeLessThan(20);
        }
      }
    }
  });

  it('keep twilight colour through thin cloud and lose it under storm cloud', () => {
    const warmth = (hex: string) => channels(hex)[0] - channels(hex)[2];
    expect(warmth(SKY_LOOK['partly-cloudy'].dusk.sky[2])).toBeGreaterThan(warmth(SKY_LOOK.storm.dusk.sky[2]));
  });
});
