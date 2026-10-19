import { describe, expect, it } from 'vitest';
import { earliestOpenStart, formatClock, isOpenThroughout, toMs } from '../src';
import { TZ, at, everyDay } from './fixtures';

describe('opening hours', () => {
  const day = everyDay('09:00', '17:00');

  it('knows when a place is open for a whole window', () => {
    expect(isOpenThroughout(day, toMs(at('10:00')), toMs(at('12:00')), TZ)).toBe(true);
    expect(isOpenThroughout(day, toMs(at('16:00')), toMs(at('17:30')), TZ)).toBe(false);
    expect(isOpenThroughout(day, toMs(at('08:30')), toMs(at('09:30')), TZ)).toBe(false);
  });

  it('finds the earliest start once a place opens', () => {
    const start = earliestOpenStart(day, toMs(at('07:00')), 60, toMs(at('22:00')), TZ);
    expect(start).not.toBeNull();
    expect(formatClock(start!, TZ)).toBe('9:00 AM');
  });

  it('returns null when nothing fits before the deadline', () => {
    expect(earliestOpenStart(day, toMs(at('16:30')), 60, toMs(at('22:00')), TZ)).toBeNull();
  });

  it('handles periods that run past midnight', () => {
    const bar = everyDay('18:00', '02:00');
    expect(isOpenThroughout(bar, toMs(at('23:00')), toMs('2026-10-20T01:30:00+08:00'), TZ)).toBe(true);
    // Early Monday morning is Sunday night's period.
    expect(isOpenThroughout(bar, toMs(at('00:30')), toMs(at('01:30')), TZ)).toBe(true);
    expect(isOpenThroughout(bar, toMs(at('03:00')), toMs(at('04:00')), TZ)).toBe(false);
  });

  it('treats 24/7 places as always open', () => {
    expect(isOpenThroughout({ always: true, periods: [] }, toMs(at('03:00')), toMs(at('05:00')), TZ)).toBe(true);
  });

  it('respects weekday-only schedules', () => {
    const weekdays = { periods: [1, 2, 3, 4, 5].map((d) => ({ day: d, open: '08:00', close: '18:00' })) };
    // 2026-10-19 is a Monday; 2026-10-18 a Sunday.
    expect(isOpenThroughout(weekdays, toMs(at('10:00')), toMs(at('11:00')), TZ)).toBe(true);
    expect(isOpenThroughout(weekdays, toMs('2026-10-18T10:00:00+08:00'), toMs('2026-10-18T11:00:00+08:00'), TZ)).toBe(false);
  });
});
