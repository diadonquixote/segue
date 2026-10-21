/**
 * Days on the calendar: the month grid, the week strip, events grouped by
 * day, and the plans kept from past days. Pure, so it's easy to test.
 * Days are local "YYYY-MM-DD" keys throughout.
 */
import type { CalendarEvent } from './calendar';
import type { DayState, StoredBlock } from './model';

/** Weeks start on Sunday, like most calendars in the Philippines. */
export const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const pad = (n: number) => String(n).padStart(2, '0');

export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight for a day key. */
export function parseKey(key: string): Date {
  const [y = 1970, m = 1, d = 1] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseKey(key);
  return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

export function startOfWeek(key: string): string {
  return addDays(key, -parseKey(key).getDay());
}

/** The seven days of the week that holds `key`, Sunday first. */
export function weekOf(key: string): string[] {
  const first = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** The first of the month for a day key. */
export function monthOf(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

export function addMonths(monthKey: string, n: number): string {
  const d = parseKey(monthKey);
  return keyOf(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

/** Whole weeks covering the month: the grid's cells, Sunday first, 4 to 6 rows. */
export function monthGrid(monthKey: string): string[] {
  const first = parseKey(monthOf(monthKey));
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const start = startOfWeek(keyOf(first));
  const end = addDays(startOfWeek(keyOf(last)), 6);
  const cells: string[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) cells.push(k);
  return cells;
}

export const inMonth = (key: string, monthKey: string) => key.slice(0, 7) === monthKey.slice(0, 7);

/** Start and end (exclusive) of a run of days, as ISO timestamps for the Calendar API. */
export function rangeBounds(from: string, toExclusive: string): { start: string; end: string } {
  return { start: parseKey(from).toISOString(), end: parseKey(toExclusive).toISOString() };
}

/** Events by the local day they start on. */
export function groupByDay(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  const out: Record<string, CalendarEvent[]> = {};
  for (const e of events) (out[keyOf(new Date(e.start))] ??= []).push(e);
  return out;
}

/** Events saved on the phone for the days you've opened, so the calendar shows them offline. */
export interface CalendarDays {
  days: Record<string, CalendarEvent[]>;
  syncedAt?: string;
}

export const EMPTY_DAYS: CalendarDays = { days: {} };

/** How many days of events to keep on the phone. */
const KEEP_EVENT_DAYS = 120;

/**
 * Fold freshly fetched events for [from, to) into what's saved. Every day in
 * the range is written, so a day with no events is known to be empty rather
 * than not loaded yet.
 */
export function mergeDays(saved: CalendarDays, from: string, toExclusive: string, events: CalendarEvent[], syncedAt: string): CalendarDays {
  const grouped = groupByDay(events);
  const days = { ...saved.days };
  for (let k = from; k < toExclusive; k = addDays(k, 1)) days[k] = grouped[k] ?? [];
  const keys = Object.keys(days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_EVENT_DAYS))) delete days[k];
  return { days, syncedAt };
}

/** One thing from a past day's plan, and what became of it. */
export interface ArchivedItem {
  blockId: string;
  title: string;
  start: string;
  end: string;
  place?: string;
  status: 'done' | 'skipped' | 'planned';
}

export interface ArchivedDay {
  date: string;
  items: ArchivedItem[];
}

export type DayArchive = Record<string, ArchivedDay>;

/** How many past days of plans to keep on the phone. */
const KEEP_PLAN_DAYS = 120;

export function archiveDay(d: DayState): ArchivedDay | null {
  if (!d.plan?.items.length) return null;
  const done = new Set(d.doneIds);
  const skipped = new Set(d.skippedIds);
  return {
    date: d.date,
    items: d.plan.items.map((i) => ({
      blockId: i.blockId,
      title: i.title,
      start: i.start,
      end: i.end,
      place: i.place?.name,
      status: done.has(i.blockId) ? 'done' : skipped.has(i.blockId) ? 'skipped' : 'planned',
    })),
  };
}

/** The archive with this day's plan saved (or replaced), oldest days dropped past the limit. */
export function withArchived(archive: DayArchive, d: DayState): DayArchive {
  const entry = archiveDay(d);
  if (!entry) return archive;
  const next: DayArchive = { ...archive, [d.date]: entry };
  const keys = Object.keys(next).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_PLAN_DAYS))) delete next[k];
  return next;
}

/** One-off things set for a particular day (not routines). */
export function oneOffsOn(blocks: StoredBlock[], key: string): StoredBlock[] {
  return blocks.filter((b) => b.date === key);
}

/** "Today", "Tomorrow", "Yesterday", or nothing. */
export function relativeDay(key: string, today: string): string | null {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return null;
}

export function dayLabel(key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }): string {
  return new Intl.DateTimeFormat(undefined, opts).format(parseKey(key));
}

export function monthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(parseKey(monthKey));
}
