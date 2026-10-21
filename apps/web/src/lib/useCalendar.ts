import { useRef, useState } from 'react';
import { EMPTY_CALENDAR, calendarBlocks, type CalendarState } from './calendar';
import { EMPTY_DAYS, addDays, mergeDays, rangeBounds, type CalendarDays } from './days';
import { clock } from './format';
import {
  CalendarError,
  calendarErrorMessage,
  currentToken,
  fetchEvents,
  fetchTodayEvents,
  forgetToken,
  requestToken,
  revokeToken,
  tokenValid,
} from './googleCalendar';
import { usePersisted } from './hooks';
import { localDate } from './model';

/** Older than this, a re-route mentions when the calendar was last synced. */
const CALENDAR_STALE_MS = 3 * 60 * 60_000;
/** The same days aren't fetched again sooner than this, unless you tap Sync. */
const RANGE_FRESH_MS = 5 * 60_000;

/** Google Calendar: connect, sync, disconnect, blocks for a re-route, and events for the days you open. */
export function useCalendar(ready: boolean, notify: (message: string) => void) {
  const [calendar, setCalendar] = usePersisted<CalendarState>('calendar', EMPTY_CALENDAR, ready);
  const [days, setDays] = usePersisted<CalendarDays>('calendarDays', EMPTY_DAYS, ready);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeBusy, setRangeBusy] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const lastRange = useRef<{ key: string; at: number } | null>(null);

  /**
   * Fetch today's events. Runs from a tap: if a new Google token is needed,
   * the sign-in popup must open before the first await, which it does here.
   */
  async function sync(prompt: '' | 'consent' = '') {
    setBusy(true);
    setError(null);
    try {
      let token = currentToken();
      if (prompt === 'consent' || !tokenValid(token)) token = await requestToken(prompt);
      const now = new Date();
      const events = await fetchTodayEvents(token, now);
      const wasConnected = calendar.connected;
      setCalendar({ connected: true, date: localDate(now), events, syncedAt: now.toISOString() });
      const today = localDate(now);
      setDays((d) => mergeDays(d, today, addDays(today, 1), events, now.toISOString()));
      const count = events.length === 1 ? '1 event' : `${events.length} events`;
      notify(!wasConnected ? `Google Calendar connected: ${count} today.` : `Calendar synced: ${count} today.`);
      return true;
    } catch (e) {
      if (e instanceof CalendarError && e.kind === 'expired') forgetToken();
      setError(calendarErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /**
   * Events for the days on screen, [from, to). Without a live Google token it
   * only fetches when `interactive` (a tap), since that may open Google's window.
   */
  async function loadRange(from: string, toExclusive: string, { interactive = false } = {}) {
    if (!calendar.connected) return;
    const key = `${from}|${toExclusive}`;
    const token = currentToken();
    if (!interactive) {
      if (!tokenValid(token)) return;
      if (lastRange.current?.key === key && Date.now() - lastRange.current.at < RANGE_FRESH_MS) return;
    }
    setRangeBusy(true);
    setRangeError(null);
    try {
      const live = tokenValid(token) ? token : await requestToken('');
      const { start, end } = rangeBounds(from, toExclusive);
      const events = await fetchEvents(live, start, end);
      const at = new Date().toISOString();
      setDays((d) => mergeDays(d, from, toExclusive, events, at));
      lastRange.current = { key, at: Date.now() };
    } catch (e) {
      if (e instanceof CalendarError && e.kind === 'expired') forgetToken();
      setRangeError(calendarErrorMessage(e));
    } finally {
      setRangeBusy(false);
    }
  }

  function disconnect() {
    revokeToken(currentToken());
    setCalendar(EMPTY_CALENDAR);
    setDays(EMPTY_DAYS);
    lastRange.current = null;
    setError(null);
    setRangeError(null);
    notify('Google Calendar disconnected. Re-route to take its events out of your plan.');
  }

  /** Calendar blocks for a re-route, refreshed first when there's a live token. */
  async function forReroute(start: Date, room: number) {
    let cal = calendar;
    if (!cal.connected) return { extra: [], warnings: [] as string[] };
    const token = currentToken();
    if (tokenValid(token)) {
      try {
        const events = await fetchTodayEvents(token, start);
        cal = { connected: true, date: localDate(start), events, syncedAt: start.toISOString() };
        setCalendar(cal);
        const today = localDate(start);
        setDays((d) => mergeDays(d, today, addDays(today, 1), events, start.toISOString()));
      } catch {
        // keep what was saved; the warnings below say how old it is
      }
    }
    const warnings: string[] = [];
    if (cal.date !== localDate(start)) {
      warnings.push("Calendar hasn't synced today, so its events aren't in this plan. Sync it in Settings.");
      return { extra: [], warnings };
    }
    if (cal.syncedAt && start.getTime() - Date.parse(cal.syncedAt) > CALENDAR_STALE_MS) {
      warnings.push(`Calendar events are from ${clock(cal.syncedAt)}. Sync in Settings if anything changed.`);
    }
    if (cal.events.length > room) {
      warnings.push(`Only ${room} of today's ${cal.events.length} calendar events fit in one plan.`);
    }
    return { extra: calendarBlocks(cal.events, room), warnings };
  }

  return { calendar, setCalendar, days, setDays, busy, error, sync, disconnect, forReroute, loadRange, rangeBusy, rangeError };
}

