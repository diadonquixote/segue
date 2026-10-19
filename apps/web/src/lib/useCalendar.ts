import { useState } from 'react';
import { EMPTY_CALENDAR, calendarBlocks, type CalendarState } from './calendar';
import { clock } from './format';
import { CalendarError, calendarErrorMessage, currentToken, fetchTodayEvents, forgetToken, requestToken, revokeToken, tokenValid } from './googleCalendar';
import { usePersisted } from './hooks';
import { localDate } from './model';

/** Older than this, a re-route mentions when the calendar was last synced. */
const CALENDAR_STALE_MS = 3 * 60 * 60_000;

/** Google Calendar: connect, sync, disconnect, and blocks for a re-route. */
export function useCalendar(ready: boolean, notify: (message: string) => void) {
  const [calendar, setCalendar] = usePersisted<CalendarState>('calendar', EMPTY_CALENDAR, ready);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const events = await fetchTodayEvents(token, new Date());
      const wasConnected = calendar.connected;
      setCalendar({ connected: true, date: localDate(), events, syncedAt: new Date().toISOString() });
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

  function disconnect() {
    revokeToken(currentToken());
    setCalendar(EMPTY_CALENDAR);
    setError(null);
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

  return { calendar, setCalendar, busy, error, sync, disconnect, forReroute };
}
