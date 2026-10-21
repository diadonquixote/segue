import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../src/lib/calendar';
import {
  addDays,
  addMonths,
  archiveDay,
  groupByDay,
  inMonth,
  keyOf,
  mergeDays,
  monthGrid,
  oneOffsOn,
  parseKey,
  relativeDay,
  startOfWeek,
  weekOf,
  withArchived,
  EMPTY_DAYS,
} from '../src/lib/days';
import { emptyDay, type DayState, type StoredBlock } from '../src/lib/model';

/** An event at a local time on a local day, so the tests don't depend on the machine's time zone. */
const ev = (id: string, day: string, h: number, minutes = 60): CalendarEvent => {
  const d = parseKey(day);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h);
  return { id, title: id, start: start.toISOString(), end: new Date(start.getTime() + minutes * 60_000).toISOString() };
};

describe('day keys', () => {
  it('round-trips and steps across months and years', () => {
    expect(keyOf(parseKey('2026-10-22'))).toBe('2026-10-22');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-03-01', -1)).toBe('2026-02-01');
  });

  it('starts weeks on Sunday', () => {
    expect(startOfWeek('2026-10-22')).toBe('2026-10-18'); // a Thursday
    expect(startOfWeek('2026-10-18')).toBe('2026-10-18');
    expect(weekOf('2026-10-22')).toEqual(['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24']);
  });

  it('says today, tomorrow and yesterday', () => {
    expect(relativeDay('2026-10-22', '2026-10-22')).toBe('Today');
    expect(relativeDay('2026-10-23', '2026-10-22')).toBe('Tomorrow');
    expect(relativeDay('2026-10-21', '2026-10-22')).toBe('Yesterday');
    expect(relativeDay('2026-10-30', '2026-10-22')).toBeNull();
  });
});

describe('month grid', () => {
  it('covers whole weeks, Sunday first, and only the weeks the month needs', () => {
    const oct = monthGrid('2026-10-01'); // Oct 1, 2026 is a Thursday; Oct 31 a Saturday
    expect(oct[0]).toBe('2026-09-27');
    expect(oct[oct.length - 1]).toBe('2026-10-31');
    expect(oct).toHaveLength(35);
    expect(oct.filter((k) => inMonth(k, '2026-10-01'))).toHaveLength(31);
    const feb = monthGrid('2026-02-01'); // starts on a Sunday, 28 days: exactly four weeks
    expect(feb).toHaveLength(28);
    expect(monthGrid('2026-08-01')).toHaveLength(42); // Aug 2026 starts Saturday, ends Monday
  });
});

describe('events by day', () => {
  it('groups events under the local day they start', () => {
    const g = groupByDay([ev('a', '2026-10-22', 9), ev('b', '2026-10-22', 15), ev('c', '2026-10-24', 10)]);
    expect(Object.keys(g).sort()).toEqual(['2026-10-22', '2026-10-24']);
    expect(g['2026-10-22']!.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('marks every fetched day, so an empty day is known to be empty', () => {
    const saved = { days: { '2026-10-01': [ev('old', '2026-10-01', 9)] } };
    const next = mergeDays(saved, '2026-10-20', '2026-10-23', [ev('x', '2026-10-21', 11)], '2026-10-22T00:00:00Z');
    expect(next.days['2026-10-20']).toEqual([]);
    expect(next.days['2026-10-21']!.map((e) => e.id)).toEqual(['x']);
    expect(next.days['2026-10-22']).toEqual([]);
    expect(next.days['2026-10-23']).toBeUndefined();
    expect(next.days['2026-10-01']).toHaveLength(1);
    expect(next.syncedAt).toBe('2026-10-22T00:00:00Z');
  });

  it('replaces a day when it is fetched again (an event was deleted)', () => {
    const first = mergeDays(EMPTY_DAYS, '2026-10-22', '2026-10-23', [ev('a', '2026-10-22', 9)], 't1');
    const again = mergeDays(first, '2026-10-22', '2026-10-23', [], 't2');
    expect(again.days['2026-10-22']).toEqual([]);
  });

  it('keeps only the most recent days', () => {
    let d = EMPTY_DAYS;
    d = mergeDays(d, '2026-01-01', '2026-06-30', [], 't');
    expect(Object.keys(d.days)).toHaveLength(120);
    expect(Object.keys(d.days).sort()[0]).toBe(addDays('2026-06-30', -120));
  });
});

describe('past days', () => {
  const withPlan = (date: string): DayState => ({
    ...emptyDay(date),
    plan: {
      items: [
        { blockId: 'gym', title: 'Gym', start: '2026-10-21T09:00:00Z', end: '2026-10-21T10:00:00Z', travelMinutesBefore: 0, confidence: 'no-place', fixed: false, fallbacks: [] },
        { blockId: 'lunch', title: 'Lunch', start: '2026-10-21T12:00:00Z', end: '2026-10-21T13:00:00Z', travelMinutesBefore: 0, confidence: 'no-place', fixed: false, fallbacks: [] },
        { blockId: 'run', title: 'Run', start: '2026-10-21T17:00:00Z', end: '2026-10-21T18:00:00Z', travelMinutesBefore: 0, confidence: 'no-place', fixed: false, fallbacks: [] },
      ],
      unscheduled: [],
      totalTravelMinutes: 0,
    } as unknown as DayState['plan'],
    doneIds: ['gym'],
    skippedIds: ['run'],
  });

  it('keeps what was done, skipped or still planned', () => {
    const a = archiveDay(withPlan('2026-10-21'))!;
    expect(a.date).toBe('2026-10-21');
    expect(a.items.map((i) => [i.blockId, i.status])).toEqual([
      ['gym', 'done'],
      ['lunch', 'planned'],
      ['run', 'skipped'],
    ]);
  });

  it('ignores a day without a plan and replaces a day planned again', () => {
    expect(archiveDay(emptyDay('2026-10-21'))).toBeNull();
    const once = withArchived({}, withPlan('2026-10-21'));
    expect(withArchived(once, emptyDay('2026-10-22'))).toBe(once);
    const again = withArchived(once, { ...withPlan('2026-10-21'), doneIds: ['gym', 'lunch'] });
    expect(again['2026-10-21']!.items[1]!.status).toBe('done');
  });

  it('keeps about four months', () => {
    let a = {};
    for (let k = '2026-01-01'; k < '2026-07-01'; k = addDays(k, 1)) a = withArchived(a, withPlan(k));
    expect(Object.keys(a)).toHaveLength(120);
  });
});

describe('planning ahead', () => {
  it('finds one-offs for a day and not routines', () => {
    const blocks = [
      { id: 'r', title: 'Run', date: undefined },
      { id: 'f', title: 'Dentist', date: '2026-10-24' },
      { id: 't', title: 'Lunch', date: '2026-10-22' },
    ] as StoredBlock[];
    expect(oneOffsOn(blocks, '2026-10-24').map((b) => b.id)).toEqual(['f']);
  });
});
