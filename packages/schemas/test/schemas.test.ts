import { describe, expect, it } from 'vitest';
import { BlockSchema, ContextSchema, NearbyQuerySchema, RerouteRequestSchema, formatIssues } from '../src';

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
