import { describe, expect, it } from 'vitest';
import { AA_BODY, CHIP_ALPHA, SCRIM, contrast, headerScrim, headerTextContrast, modeFor, pageTheme, passesAA } from '../src/lib/pageTheme';
import { SKY_LOOK, hexRgb, mixRgb, toneAt } from '../src/lib/skyRenderer';
import { SKY_CONDITIONS } from '../src/lib/weather';

const PHASES = ['night', 'dawn', 'golden-hour', 'day', 'dusk'] as const;

describe('page theme', () => {
  it('measures contrast like WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('goes dark at night and dusk whatever the system theme, and follows it by day', () => {
    expect(modeFor('night', false)).toBe('dark');
    expect(modeFor('dusk', false)).toBe('dark');
    expect(modeFor('day', false)).toBe('light');
    expect(modeFor('golden-hour', false)).toBe('light');
    expect(modeFor('day', true)).toBe('dark');
  });

  it('keeps every text colour at AA in every sky, phase and system theme', () => {
    for (const condition of SKY_CONDITIONS) {
      for (const phase of PHASES) {
        for (const systemDark of [false, true]) {
          const theme = pageTheme(SKY_LOOK[condition][phase], phase, systemDark);
          expect(passesAA(theme.tokens), `${condition} ${phase} ${systemDark ? 'dark' : 'light'} system`).toBe(true);
          expect(contrast(theme.tokens.ink, theme.tokens.fog)).toBeGreaterThanOrEqual(AA_BODY);
        }
      }
    }
  });

  it('also holds between phases, where the sky is a blend', () => {
    for (const condition of SKY_CONDITIONS) {
      for (let e = -14; e <= 14; e += 1) {
        const theme = pageTheme(toneAt(condition, e, e % 2 === 0), e < -6 ? 'night' : e < 0 ? 'dusk' : 'day', false);
        expect(passesAA(theme.tokens)).toBe(true);
      }
    }
  });

  it('actually takes on the sky: blue by day, warm at golden hour', () => {
    const day = hexRgb(pageTheme(SKY_LOOK.clear.day, 'day', false).tokens.fog);
    const golden = hexRgb(pageTheme(SKY_LOOK.clear['golden-hour'], 'golden-hour', false).tokens.fog);
    expect(day[2]).toBeGreaterThan(day[0]); // bluer than red
    expect(golden[0]).toBeGreaterThan(golden[2]); // warmer than blue
    expect(pageTheme(SKY_LOOK.clear.day, 'day', false).tokens.fog).not.toBe('#f2f4f8');
  });
});

describe('header text on the sky', () => {
  it('stays at AA in every sky and phase, even with a bright cloud behind it', () => {
    for (const condition of SKY_CONDITIONS) {
      for (const phase of PHASES) expect(headerTextContrast(SKY_LOOK[condition][phase]), `${condition} ${phase}`).toBeGreaterThanOrEqual(AA_BODY);
      for (let e = -14; e <= 14; e++) for (const morning of [true, false]) expect(headerTextContrast(toneAt(condition, e, morning))).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('only darkens as much as each sky needs', () => {
    expect(headerScrim(SKY_LOOK.storm.night)).toBeLessThan(headerScrim(SKY_LOOK.fog.day));
    expect(headerScrim(SKY_LOOK.clear.night)).toBeLessThan(0.3);
  });

  it('keeps white text on the pills and tabs readable over anything', () => {
    expect(contrast('#ffffff', mixRgb([255, 255, 255], SCRIM, CHIP_ALPHA))).toBeGreaterThanOrEqual(AA_BODY);
  });
});
