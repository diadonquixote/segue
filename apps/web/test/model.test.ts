import { describe, expect, it } from 'vitest';
import { toEngineBlock, todayAt, type StoredBlock } from '../src/lib/model';

describe('stored blocks → engine blocks', () => {
  const now = new Date('2026-10-19T09:00:00Z');

  it('turns wall-clock times into today-dated timestamps', () => {
    const iso = todayAt('13:30', now);
    expect(iso.startsWith(`${iso.slice(0, 10)}T13:30:00`)).toBe(true);
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });

  it('dates windows and drops places for fixed blocks', () => {
    const lunch: StoredBlock = {
      id: 'l',
      title: 'Lunch',
      minMinutes: 30,
      maxMinutes: 45,
      priority: 'should',
      category: 'restaurant',
      requirements: [],
      earliest: '11:00',
      latest: '14:00',
      active: true,
    };
    const b = toEngineBlock(lunch, now);
    expect(Date.parse(b.latest!) - Date.parse(b.earliest!)).toBe(3 * 60 * 60 * 1000);

    const cls = toEngineBlock({ ...lunch, id: 'c', category: 'library', requirements: ['quiet'], fixedStart: '15:00', fixedEnd: '16:30' }, now);
    expect(cls.fixed).toBeDefined();
    expect(cls.category).toBe('none');
    expect(cls.requirements).toEqual([]);
    expect(Date.parse(cls.fixed!.end) - Date.parse(cls.fixed!.start)).toBe(90 * 60 * 1000);
  });

  it('never lets max fall below min', () => {
    const b = toEngineBlock(
      { id: 'x', title: 'X', minMinutes: 60, maxMinutes: 30, priority: 'nice', category: 'none', requirements: [], active: true },
      now,
    );
    expect(b.maxMinutes).toBe(60);
  });
});
