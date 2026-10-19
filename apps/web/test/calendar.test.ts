import { describe, expect, it } from 'vitest';
import { reroute } from '@segue/engine';
import { calendarBlockId, calendarBlocks, isCalendarBlock, parseEvents, type GoogleEvent } from '../src/lib/calendar';

const dayStart = '2026-10-19T00:00:00+08:00';
const dayEnd = '2026-10-20T00:00:00+08:00';
const timed = (id: string, start: string, end: string, extra: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id,
  summary: id,
  start: { dateTime: start },
  end: { dateTime: end },
  ...extra,
});

describe('Google Calendar events', () => {
  it('keeps only events that make you busy', () => {
    const events = parseEvents(
      [
        timed('standup', '2026-10-19T09:00:00+08:00', '2026-10-19T09:30:00+08:00', { location: ' Room 3 ' }),
        timed('cancelled', '2026-10-19T10:00:00+08:00', '2026-10-19T11:00:00+08:00', { status: 'cancelled' }),
        timed('free', '2026-10-19T10:00:00+08:00', '2026-10-19T11:00:00+08:00', { transparency: 'transparent' }),
        timed('declined', '2026-10-19T12:00:00+08:00', '2026-10-19T13:00:00+08:00', {
          attendees: [{ self: true, responseStatus: 'declined' }],
        }),
        timed('blip', '2026-10-19T14:00:00+08:00', '2026-10-19T14:02:00+08:00'),
        { id: 'birthday', summary: 'Birthday', start: { date: '2026-10-19' }, end: { date: '2026-10-20' } },
      ],
      dayStart,
      dayEnd,
    );
    expect(events.map((e) => e.id)).toEqual(['standup']);
    expect(events[0]!.location).toBe('Room 3');
  });

  it('counts only the part of a late event that falls inside today', () => {
    const [e] = parseEvents([timed('flight', '2026-10-19T22:00:00+08:00', '2026-10-20T03:00:00+08:00')], dayStart, dayEnd);
    expect(Date.parse(e!.end)).toBe(Date.parse(dayEnd));
  });

  it('names untitled events and keeps titles within the API limit', () => {
    const [untitled, long] = parseEvents(
      [
        { ...timed('a', '2026-10-19T09:00:00+08:00', '2026-10-19T10:00:00+08:00'), summary: '' },
        { ...timed('b', '2026-10-19T11:00:00+08:00', '2026-10-19T12:00:00+08:00'), summary: 'x'.repeat(200) },
      ],
      dayStart,
      dayEnd,
    );
    expect(untitled!.title).toBe('Busy');
    expect(long!.title).toHaveLength(80);
  });

  it('makes short, stable block ids, even for long recurring-event ids', () => {
    const longId = `${'r'.repeat(70)}_20261019T010000Z`;
    expect(calendarBlockId(longId)).toBe(calendarBlockId(longId));
    expect(calendarBlockId(longId).length).toBeLessThanOrEqual(64);
    expect(calendarBlockId(longId)).not.toBe(calendarBlockId(`${longId}x`));
    expect(isCalendarBlock(calendarBlockId('abc'))).toBe(true);
    expect(isCalendarBlock('b_work')).toBe(false);
  });

  it('becomes fixed blocks the engine plans around and never moves', () => {
    const events = parseEvents([timed('standup', '2026-10-19T15:00:00+08:00', '2026-10-19T15:30:00+08:00')], dayStart, dayEnd);
    const blocks = calendarBlocks(events, 30);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ priority: 'must', minMinutes: 30, maxMinutes: 30, category: 'none' });

    const result = reroute({
      blocks: [
        ...blocks,
        { id: 'call', title: 'Call home', minMinutes: 60, maxMinutes: 60, priority: 'must', category: 'none', requirements: [] },
      ],
      candidates: {},
      context: {
        now: '2026-10-19T14:30:00+08:00',
        endOfDay: '2026-10-19T17:00:00+08:00',
        location: { lat: 14.6, lng: 121 },
        energy: 'medium',
        mode: 'walk',
        utcOffsetMinutes: 480,
      },
    });
    const meeting = result.plan.items.find((i) => i.blockId === blocks[0]!.id)!;
    expect(Date.parse(meeting.start)).toBe(Date.parse('2026-10-19T15:00:00+08:00'));
    expect(meeting.fixed).toBe(true);
    const call = result.plan.items.find((i) => i.blockId === 'call')!;
    const overlaps = Date.parse(call.start) < Date.parse(meeting.end) && Date.parse(call.end) > Date.parse(meeting.start);
    expect(overlaps).toBe(false);
  });

  it('never goes past the room left in a re-route', () => {
    const events = parseEvents(
      Array.from({ length: 5 }, (_, i) => timed(`e${i}`, `2026-10-19T1${i}:00:00+08:00`, `2026-10-19T1${i}:30:00+08:00`)),
      dayStart,
      dayEnd,
    );
    expect(calendarBlocks(events, 3)).toHaveLength(3);
    expect(calendarBlocks(events, -2)).toHaveLength(0);
  });
});
