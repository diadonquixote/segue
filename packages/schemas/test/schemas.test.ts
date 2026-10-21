import { describe, expect, it } from 'vitest';
import {
  BlockSchema,
  ContextSchema,
  CurrentWeatherSchema,
  NearbyQuerySchema,
  RerouteRequestSchema,
  SKY_CONDITION_VALUES,
  SkyConditionSchema,
  formatIssues,
} from '../src';

const block = { id: 'b1', title: 'Deep work', minMinutes: 60, maxMinutes: 120, priority: 'must', category: 'cafe', requirements: ['wifi'] };
const ctx = {
  now: '2026-10-19T14:00:00+08:00',
  endOfDay: '2026-10-19T22:00:00+08:00',
  location: { lat: 14.6, lng: 121 },
  energy: 'medium',
  mode: 'walk',
  utcOffsetMinutes: 480,
};

describe('schemas', () => {
  it('accepts a valid re-route request', () => {
    expect(RerouteRequestSchema.safeParse({ blocks: [block], context: ctx }).success).toBe(true);
  });

  it('rejects max shorter than min', () => {
    const r = BlockSchema.safeParse({ ...block, maxMinutes: 30 });
    expect(r.success).toBe(false);
    if (!r.success) expect(formatIssues(r.error).join()).toMatch(/maxMinutes/);
  });

  it('rejects an end of day before now', () => {
    expect(ContextSchema.safeParse({ ...ctx, endOfDay: '2026-10-19T10:00:00+08:00' }).success).toBe(false);
  });

  it('rejects unknown categories and requirements', () => {
    expect(BlockSchema.safeParse({ ...block, category: 'spaceport' }).success).toBe(false);
    expect(BlockSchema.safeParse({ ...block, requirements: ['teleporter'] }).success).toBe(false);
  });

  it('coerces nearby query strings and applies defaults', () => {
    const q = NearbyQuerySchema.parse({ lat: '14.6', lng: '121', category: 'gym' });
    expect(q).toEqual({ lat: 14.6, lng: 121, category: 'gym', radius: 1500, limit: 20 });
  });
});

describe('current weather', () => {
  it('accepts every sky, including partly cloudy and fog', () => {
    for (const condition of SKY_CONDITION_VALUES) {
      expect(CurrentWeatherSchema.safeParse({ condition, isDay: true, observedAt: '2026-10-20T04:00:00Z' }).success).toBe(true);
    }
    expect(SkyConditionSchema.safeParse('haze').success).toBe(false);
  });

  it('rejects impossible readings', () => {
    expect(CurrentWeatherSchema.safeParse({ condition: 'fog', isDay: true, observedAt: 'soon' }).success).toBe(false);
    expect(
      CurrentWeatherSchema.safeParse({ condition: 'rain', isDay: false, observedAt: '2026-10-20T04:00:00Z', upcoming: [{ time: '2026-10-20T05:00:00Z', rainChance: 140 }] }).success,
    ).toBe(false);
  });
});
