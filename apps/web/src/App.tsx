import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FallbackOption, Place, Plan, PlanItem } from '@segue/engine';
import { BlockForm, RoutinesView } from './components/Blocks';
import { CalendarCard } from './components/CalendarCard';
import { CalendarPage } from './components/CalendarPage';
import { ItemSheet } from './components/ItemSheet';
import { Onboarding } from './components/Onboarding';
import { PlanPage } from './components/PlanPage';
import { QuickAdd } from './components/QuickAdd';
import { ReplanSheet } from './components/ReplanSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { SkyHeader, type LocationStatus, type View } from './components/SkyHeader';
import { Timeline } from './components/Timeline';
import { calendarBlockId } from './lib/calendar';
import { clock } from './lib/format';
import { GOOGLE_CLIENT_ID } from './lib/googleCalendar';
import { useNow, usePersisted } from './lib/hooks';
import { currentLocation, locate, locationPermission } from './lib/location';
import {
  affinityFrom,
  emptyDay,
  localDate,
  plannedToday,
  todayAt,
  utcOffsetMinutes,
  type DayState,
  type FavoritePlace,
  type PlaceCache,
  type PlaceHistory,
  type Settings,
  type StoredBlock,
} from './lib/model';
import { activeNudges, nudgesFor } from './lib/nudges';
import { BUSY_BLOCK_ID, adjustFor, type ReplanReason } from './lib/replan';
import { rerouteDay, type RerouteOutcome } from './lib/reroute';
import { navigate, useRoute } from './lib/router';
import { DEFAULT_LOCATION, DEFAULT_SETTINGS, SEED_BLOCKS } from './lib/seed';
import { clearAll, getItem } from './lib/store';
import { useCalendar } from './lib/useCalendar';
import { askNotificationPermission, useReminders } from './lib/useReminders';
import { useSky } from './lib/useSky';

/** The API takes at most this many blocks per re-route (packages/schemas). */
const MAX_BLOCKS = 30;
const UNDO_DEPTH = 10;

type SheetState =
  | { kind: 'replan' }
  | { kind: 'item'; id: string }
  | { kind: 'block'; id: string | null; draft?: StoredBlock }
  | { kind: 'settings' }
  | null;

interface Toast {
  text: string;
  undo?: boolean;
}

const hhmmToIso = (hhmm: string, d = new Date()) => new Date(todayAt(hhmm, d)).toISOString();

export function App() {
  const [ready, setReady] = useState(false);
  const [blocks, setBlocks] = usePersisted<StoredBlock[]>('blocks', [], ready);
  const [settings, setSettings] = usePersisted<Settings>('settings', DEFAULT_SETTINGS, ready);
  const [day, setDay] = usePersisted<DayState>('day', emptyDay(), ready);
  const [placeCache, setPlaceCache] = usePersisted<PlaceCache | undefined>('placeCache', undefined, ready);
  const [favorites, setFavorites] = usePersisted<FavoritePlace[]>('favorites', [], ready);
  const [history, setHistory] = usePersisted<PlaceHistory>('placeHistory', {}, ready);
  const [undoStack, setUndoStack] = useState<DayState[]>([]);
  const route = useRoute();
  // Where Back on the calendar screen returns to.
  const lastRoute = useRef<View>('today');
  useEffect(() => {
    if (route !== 'calendar') lastRoute.current = route;
  }, [route]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [replanBusy, setReplanBusy] = useState(false);
  const [replanError, setReplanError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RerouteOutcome | null>(null);
  const [reason, setReason] = useState<ReplanReason | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [seed, setSeed] = useState<{ text: string; n: number } | undefined>();
  const now = useNow();
  const today = localDate(now);
  const notify = useCallback((text: string) => setToast({ text }), []);
  const cal = useCalendar(ready, notify);
  const sky = useSky(settings.lastLocation ?? DEFAULT_LOCATION, now);

  // Load everything from the device first, so the app opens instantly offline.
  useEffect(() => {
    void (async () => {
      const [b, s, d, c, f, h, calendar] = await Promise.all([
        getItem<StoredBlock[]>('blocks'),
        getItem<Settings>('settings'),
        getItem<DayState>('day'),
        getItem<PlaceCache>('placeCache'),
        getItem<FavoritePlace[]>('favorites'),
        getItem<PlaceHistory>('placeHistory'),
        getItem<typeof cal.calendar>('calendar'),
      ]);
      // People who used Segue before the setup screens existed skip them.
      setBlocks(b ?? []);
      setSettings({ ...DEFAULT_SETTINGS, ...s, onboarded: s?.onboarded ?? !!b?.length });
      setDay(d && d.date === localDate() ? d : emptyDay());
      setPlaceCache(c);
      setFavorites(f ?? []);
      setHistory(h ?? {});
      if (calendar) cal.setCalendar(calendar);
      setReady(true);
      // Already allowed: quietly refresh where we are, so the sky is local. Never prompts.
      const permission = await locationPermission();
      if (permission === 'granted') void locateNow({ quiet: true });
      if (permission === 'denied') setLocationDenied(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // A new day starts with a clean slate.
  useEffect(() => {
    if (ready && day.date !== today) {
      setDay(emptyDay(today));
      setUndoStack([]);
    }
  }, [today, ready, day.date, setDay]);

  /** Change the day so it can be undone. */
  const changeDay = useCallback(
    (next: (d: DayState) => DayState) => {
      setUndoStack((s) => [day, ...s].slice(0, UNDO_DEPTH));
      setDay(next(day));
    },
    [day, setDay],
  );

  function undo() {
    const [prev, ...rest] = undoStack;
    if (!prev) return;
    setDay(prev);
    setUndoStack(rest);
    setToast({ text: 'Undone.' });
  }

  async function locateNow({ quiet = false } = {}) {
    setLocating(true);
    const found = await locate();
    setLocating(false);
    if (found.ok) {
      const at = new Date().toISOString();
      setLocationDenied(false);
      setSettings((s) => ({ ...s, lastLocation: found.location, lastLocationLabel: `near you at ${clock(at)}`, lastLocatedAt: at }));
      if (!quiet) setToast({ text: 'Using your location.' });
    } else if (found.reason === 'denied') {
      setLocationDenied(true);
      if (!quiet) setToast({ text: "Location is blocked. Allow it in your browser's site settings." });
    } else if (!quiet) {
      setToast({ text: "Couldn't find you. Try again in a moment." });
    }
  }

  function applyPlan(o: RerouteOutcome, plan: Plan, pendingBusy?: StoredBlock) {
    const had = !!day.plan;
    changeDay((d) => ({
      ...d,
      plan,
      alternatives: o.alternatives,
      changes: plan === o.plan ? o.changes : [],
      generatedAt: new Date().toISOString(),
      source: o.source,
      warnings: o.warnings,
      lockedIds: d.lockedIds.filter((id) => plan.items.some((i) => i.blockId === id)),
    }));
    // "Something came up" keeps that hour blocked for the rest of the day.
    if (pendingBusy) setBlocks((list) => [...list.filter((b) => b.id !== BUSY_BLOCK_ID), pendingBusy]);
    setOutcome(null);
    setReason(null);
    setSheet(null);
    if (route !== 'today') navigate('today');
    if (had) setToast({ text: 'Plan updated.', undo: true });
    navigator.vibrate?.(12);
  }

  const pendingBusy = useRef<StoredBlock | undefined>(undefined);

  /** Rebuild the rest of the day. One tap, no form; `why` tweaks what the engine is told. */
  const replan = useCallback(
    async (why: ReplanReason | null, opts: { autoAccept?: boolean } = {}) => {
      setReplanBusy(true);
      setReplanError(null);
      setReason(why);
      setOutcome(null);
      if (!opts.autoAccept) setSheet({ kind: 'replan' });
      try {
        const start = new Date();
        const endOfDay = todayAt(settings.endOfDay, start);
        if (Date.parse(endOfDay) <= start.getTime() + 15 * 60_000) {
          setReplanError(`Your day is set to end at ${clock(endOfDay)}. Change it in Settings to plan more.`);
          return;
        }
        const adj = adjustFor(why, start, settings.energy, endOfDay);
        const located = await currentLocation(8000, adj.refreshLocation);
        const location = located ?? settings.lastLocation ?? DEFAULT_LOCATION;
        if (located) {
          setSettings((s) => ({ ...s, lastLocation: located, lastLocationLabel: `near you at ${clock(start.toISOString())}`, lastLocatedAt: start.toISOString() }));
        }
        const excluded = new Set(day.excludedIds ?? []);
        const planned = blocks.filter((b) => plannedToday(b, localDate(start)) && b.id !== BUSY_BLOCK_ID && !excluded.has(b.id));
        const room = MAX_BLOCKS - planned.length - adj.extraBlocks.length;
        const fromCalendar = await cal.forReroute(adj.start, room);
        const o = await rerouteDay({
          blocks: planned,
          day,
          placeCache,
          favorites,
          affinity: affinityFrom(history, favorites),
          extraBlocks: [...adj.extraBlocks, ...fromCalendar.extra.filter((b) => !excluded.has(b.id))],
          context: {
            now: adj.start.toISOString(),
            endOfDay,
            location,
            energy: adj.energy,
            mode: settings.mode,
            utcOffsetMinutes: utcOffsetMinutes(start),
            weather: adj.weather,
          },
        });
        if (!located && !settings.lastLocation) o.warnings.unshift("No location yet, so this plans from Metro Manila. Tap Use my location for nearby places.");
        o.warnings.push(...fromCalendar.warnings);
        if (o.placeCache) setPlaceCache(o.placeCache);
        const busy = adj.extraBlocks.find((b) => b.id === BUSY_BLOCK_ID);
        pendingBusy.current = busy?.fixed
          ? {
              id: BUSY_BLOCK_ID,
              title: busy.title,
              minMinutes: busy.minMinutes,
              maxMinutes: busy.maxMinutes,
              priority: 'must',
              category: 'none',
              requirements: [],
              fixedStart: new Date(busy.fixed.start).toTimeString().slice(0, 5),
              fixedEnd: new Date(busy.fixed.end).toTimeString().slice(0, 5),
              active: true,
              date: localDate(start),
            }
          : undefined;
        if (opts.autoAccept) applyPlan(o, o.plan, pendingBusy.current);
        else setOutcome(o);
      } catch {
        setReplanError("Couldn't build a plan just now. Try again.");
      } finally {
        setReplanBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, day, placeCache, settings, favorites, history, cal.calendar],
  );

  // First open of the day: plan it straight away.
  const autoPlanned = useRef(false);
  useEffect(() => {
    if (!ready || !settings.onboarded || autoPlanned.current || day.plan) return;
    const hasCalendar = cal.calendar.connected && cal.calendar.date === today && cal.calendar.events.length > 0;
    if (!blocks.some((b) => plannedToday(b, today)) && !hasCalendar) return;
    autoPlanned.current = true;
    void replan(null, { autoAccept: true });
  }, [ready, settings.onboarded, day.plan, blocks, cal.calendar, today, replan]);

  /** Leave a routine or calendar event out of today's plan, or bring it back. */
  const toggleExclude = (id: string) =>
    setDay((d) => {
      const list = d.excludedIds ?? [];
      return { ...d, excludedIds: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
    });

  /** Remember what happened at a place, so Segue prefers the ones you keep going back to. */
  function learn(item: PlanItem | undefined, kind: 'done' | 'skipped') {
    if (!item?.place) return;
    const id = item.place.id;
    setHistory((h) => ({ ...h, [id]: { done: (h[id]?.done ?? 0) + (kind === 'done' ? 1 : 0), skipped: (h[id]?.skipped ?? 0) + (kind === 'skipped' ? 1 : 0) } }));
  }

  const itemById = (id: string) => day.plan?.items.find((i) => i.blockId === id);

  function mark(field: 'doneIds' | 'skippedIds', id: string) {
    learn(itemById(id), field === 'doneIds' ? 'done' : 'skipped');
    changeDay((d) => ({ ...d, [field]: [...new Set([...d[field], id])] }));
    setSheet(null);
    setToast({ text: field === 'doneIds' ? 'Nice, marked done.' : 'Skipped for today.', undo: true });
    navigator.vibrate?.(8);
  }

  const toggleLock = (id: string) =>
    changeDay((d) => ({ ...d, lockedIds: d.lockedIds.includes(id) ? d.lockedIds.filter((x) => x !== id) : [...d.lockedIds, id] }));

  function moveItem(id: string, hhmm: string) {
    changeDay((d) => {
      if (!d.plan) return d;
      const items = d.plan.items
        .map((i) => {
          if (i.blockId !== id) return i;
          const length = Date.parse(i.end) - Date.parse(i.start);
          const start = hhmmToIso(hhmm, new Date(i.start));
          return { ...i, start, end: new Date(Date.parse(start) + length).toISOString(), explanation: 'You moved it here' };
        })
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      return { ...d, plan: { ...d.plan, items }, lockedIds: [...new Set([...d.lockedIds, id])] };
    });
    setSheet(null);
    setToast({ text: `Moved to ${clock(hhmmToIso(hhmm))} and pinned. Re-route to fit the rest around it.`, undo: true });
  }

  const useFallback = (id: string, f: FallbackOption) => {
    changeDay((d) => {
      if (!d.plan) return d;
      const items = d.plan.items.map((i) =>
        i.blockId !== id
          ? i
          : {
              ...i,
              place: f.kind === 'place' ? f.place : undefined,
              confidence: f.kind === 'place' ? ('verified' as const) : ('no-place' as const),
              explanation: f.kind === 'no-place' ? f.label : `Swapped to ${f.place?.name}`,
              fallbacks: i.fallbacks.filter((x) => x.label !== f.label),
            },
      );
      return { ...d, plan: { ...d.plan, items } };
    });
    setSheet(null);
    setToast({ text: 'Swapped.', undo: true });
  };

  function toggleSpot(item: PlanItem) {
    const ref = item.place;
    if (!ref) return;
    if (favorites.some((f) => f.id === ref.id)) {
      setFavorites((list) => list.filter((f) => f.id !== ref.id));
      setToast({ text: `Removed ${ref.name} from My spots.` });
      return;
    }
    const block = blocks.find((b) => b.id === item.blockId);
    const known = Object.values(placeCache?.byCategory ?? {})
      .flat()
      .find((p) => p?.id === ref.id);
    const place: Place = known ?? {
      id: ref.id,
      name: ref.name,
      location: ref.location,
      address: ref.address,
      category: block?.category ?? 'none',
      attributes: {},
      source: 'user',
    };
    setFavorites((list) => [...list, place].slice(-30));
    setToast({ text: `Saved ${ref.name}. Segue will prefer it when it fits.` });
  }

  function addBlocks(added: StoredBlock[], { plan = true } = {}) {
    setBlocks((list) => [...list, ...added]);
    if (!plan) return;
    setToast({ text: added.length === 1 ? `Added ${added[0]!.title}.` : `Added ${added.length} things.` });
  }

  // Adding something re-plans with it, as a proposal you accept.
  const pendingReplan = useRef(false);
  useEffect(() => {
    if (!pendingReplan.current) return;
    pendingReplan.current = false;
    void replan(null, { autoAccept: !day.plan });
  }, [blocks, replan, day.plan]);

  function quickAdded(added: StoredBlock[]) {
    addBlocks(added);
    pendingReplan.current = true;
  }

  const saveBlock = (b: StoredBlock) => {
    const isNew = !blocks.some((x) => x.id === b.id);
    setBlocks((list) => (isNew ? [...list, b] : list.map((x) => (x.id === b.id ? b : x))));
    setSheet(null);
    setToast({ text: isNew ? `Added ${b.title}.` : 'Saved. Re-route to fit the change in.' });
    if (isNew) pendingReplan.current = true;
  };

  const deleteBlock = (id: string) => {
    setBlocks((list) => list.filter((x) => x.id !== id));
    setSheet(null);
    setToast({ text: 'Deleted.' });
  };

  async function toggleReminders(on: boolean) {
    if (!on) return setSettings((s) => ({ ...s, reminders: false }));
    const granted = await askNotificationPermission();
    setSettings((s) => ({ ...s, reminders: granted }));
    setToast({ text: granted ? "Reminders are on. You'll get a nudge when it's time to leave." : "Notifications are blocked, so reminders stay in the app." });
  }

  async function startOver() {
    await clearAll();
    window.location.reload();
  }

  const allNudges = useMemo(() => nudgesFor(day, now, { mode: settings.mode, blocks, sky }), [day, now, settings.mode, blocks, sky]);
  const shownNudges = activeNudges(allNudges, now).filter((n) => !dismissed.has(n.id));
  useReminders(allNudges, !!settings.reminders);

  if (!ready) return <div className="boot" aria-busy="true" />;

  const locationStatus: LocationStatus = locating
    ? { kind: 'locating' }
    : locationDenied
      ? { kind: 'denied' }
      : settings.lastLocationLabel
        ? { kind: 'located', at: settings.lastLocatedAt }
        : { kind: 'default' };

  const calendarCard = (
    <CalendarCard
      calendar={cal.calendar}
      today={today}
      busy={cal.busy}
      error={cal.error}
      onConnect={() => void cal.sync('consent')}
      onSync={() => void cal.sync()}
      onDisconnect={cal.disconnect}
    />
  );
  const calendarEvents = cal.calendar.date === day.date ? cal.calendar.events : [];
  const excludedSet = new Set(day.excludedIds ?? []);
  const openItem = sheet?.kind === 'item' ? itemById(sheet.id) : undefined;
  const editing = sheet?.kind === 'block' ? (sheet.draft ?? blocks.find((b) => b.id === sheet.id)) : undefined;

  const header = (
    <SkyHeader
      sky={sky}
      now={now}
      view={route === 'calendar' ? lastRoute.current : route}
      onView={(r) => navigate(r)}
      location={locationStatus}
      onLocate={() => void locateNow()}
      onSettings={() => setSheet({ kind: 'settings' })}
      tempUnit={settings.tempUnit ?? 'C'}
      showNav={!!settings.onboarded}
    />
  );

  if (!settings.onboarded) {
    return (
      <>
        {header}
        <div className="app">
          <Onboarding
            now={now}
            settings={settings}
            onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            location={locationStatus}
            onLocate={() => void locateNow()}
            added={blocks.filter((b) => b.date === today)}
            onAdd={(added) => addBlocks(added, { plan: false })}
            onRemove={(id) => setBlocks((list) => list.filter((b) => b.id !== id))}
            calendar={GOOGLE_CLIENT_ID ? calendarCard : null}
            calendarConnected={cal.calendar.connected}
            onExampleDay={() => {
              setBlocks((list) => [...list, ...SEED_BLOCKS.filter((s) => !list.some((b) => b.id === s.id))]);
              setSettings((s) => ({ ...s, onboarded: true }));
            }}
            onFinish={() => setSettings((s) => ({ ...s, onboarded: true }))}
          />
        </div>
        {toast && (
          <div className="toast" role="status">
            {toast.text}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {header}
      <div className="app">
        <main>
          {route === 'today' && (
            <Timeline
              day={day}
              now={now}
              mode={settings.mode}
              calendarEvents={calendarEvents}
              nudges={shownNudges}
              adder={
                <QuickAdd
                  now={now}
                  seed={seed}
                  onAdd={quickAdded}
                  onMore={(draft) => setSheet({ kind: 'block', id: null, draft })}
                  showExamples={!day.plan}
                />
              }
              onOpen={(item) => setSheet({ kind: 'item', id: item.blockId })}
              onDone={(id) => mark('doneIds', id)}
              onSkip={(id) => mark('skippedIds', id)}
              onReplan={() => void replan(null)}
              onFillGap={(from) => {
                setSeed((s) => ({ text: `after ${from}`, n: (s?.n ?? 0) + 1 }));
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onDismissNudge={(id) => setDismissed((s) => new Set(s).add(id))}
            />
          )}
          {route === 'routines' && (
            <RoutinesView
              blocks={blocks}
              today={today}
              onEdit={(id) => setSheet({ kind: 'block', id })}
              onAdd={() => setSheet({ kind: 'block', id: null })}
              onToggle={(id) => setBlocks((list) => list.map((b) => (b.id === id ? { ...b, active: !b.active } : b)))}
            />
          )}
          {route === 'plan' && (
            <PlanPage
              now={now}
              today={today}
              day={day}
              blocks={blocks}
              settings={settings}
              onSettings={(patch) => setSettings((x) => ({ ...x, ...patch }))}
              calendarConnected={cal.calendar.connected}
              calendarEvents={calendarEvents}
              excluded={excludedSet}
              onToggleExclude={toggleExclude}
              adder={<QuickAdd now={now} onAdd={(added) => addBlocks(added)} onMore={(draft) => setSheet({ kind: 'block', id: null, draft })} />}
              onRemoveBlock={(id) => setBlocks((list) => list.filter((b) => b.id !== id))}
              onEditBlock={(id) => setSheet({ kind: 'block', id })}
              onOpenCalendar={() => navigate('calendar')}
              onPlan={() => void replan(null, { autoAccept: !day.plan })}
              busy={replanBusy}
            />
          )}
          {route === 'calendar' && (
            <CalendarPage
              calendar={cal.calendar}
              today={today}
              busy={cal.busy}
              error={cal.error}
              excluded={excludedSet}
              onConnect={() => void cal.sync('consent')}
              onSync={() => void cal.sync()}
              onDisconnect={cal.disconnect}
              onToggleExclude={toggleExclude}
              onBack={() => navigate(lastRoute.current)}
              onPlan={() => {
                navigate('plan');
              }}
            />
          )}
        </main>

        {(route === 'today' || route === 'routines') && (
        <div className="dock">
          <button type="button" className="reroute" disabled={replanBusy} onClick={() => void replan(null)}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 7h9a4 4 0 0 1 0 8H8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              <path d="M11 12l-3 3 3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {replanBusy && !sheet ? 'Planning…' : 'Re-route from here'}
          </button>
        </div>
        )}

        {toast && (
          <div className="toast" role="status">
            <span>{toast.text}</span>
            {toast.undo && undoStack.length > 0 && (
              <button type="button" className="toast-undo" onClick={undo}>
                Undo
              </button>
            )}
          </div>
        )}

        {sheet?.kind === 'replan' && (
          <ReplanSheet
            busy={replanBusy}
            error={replanError}
            outcome={outcome}
            reason={reason}
            onReason={(r) => void replan(r)}
            onAccept={(plan) => outcome && applyPlan(outcome, plan, reason === 'busy' ? pendingBusy.current : undefined)}
            onClose={() => {
              setSheet(null);
              setOutcome(null);
              setReason(null);
            }}
            onOptions={() => setSheet({ kind: 'settings' })}
          />
        )}
        {openItem && (
          <ItemSheet
            item={openItem}
            block={blocks.find((b) => b.id === openItem.blockId)}
            event={calendarEvents.find((e) => calendarBlockId(e.id) === openItem.blockId)}
            mode={settings.mode}
            locked={day.lockedIds.includes(openItem.blockId)}
            savedSpot={!!openItem.place && favorites.some((f) => f.id === openItem.place!.id)}
            onClose={() => setSheet(null)}
            onDone={() => mark('doneIds', openItem.blockId)}
            onSkip={() => mark('skippedIds', openItem.blockId)}
            onTogglePin={() => toggleLock(openItem.blockId)}
            onMove={(t) => moveItem(openItem.blockId, t)}
            onUseFallback={(f) => useFallback(openItem.blockId, f)}
            onToggleSpot={() => toggleSpot(openItem)}
            onEdit={blocks.some((b) => b.id === openItem.blockId) ? () => setSheet({ kind: 'block', id: openItem.blockId }) : undefined}
          />
        )}
        {sheet?.kind === 'block' && (
          <BlockForm
            initial={editing}
            isNew={!!sheet.draft}
            onSave={saveBlock}
            onDelete={deleteBlock}
            onClose={() => setSheet(null)}
          />
        )}
        {sheet?.kind === 'settings' && (
          <SettingsSheet
            settings={settings}
            onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            location={locationStatus}
            onLocate={() => void locateNow()}
            favorites={favorites}
            onRemoveFavorite={(id) => setFavorites((list) => list.filter((f) => f.id !== id))}
            onToggleReminders={(on) => void toggleReminders(on)}
            calendar={
              <section className="settings-group">
                <h3 className="section-title">Google Calendar</h3>
                <p className="muted small">
                  {!GOOGLE_CLIENT_ID
                    ? 'Not set up on this version of Segue.'
                    : cal.calendar.connected
                      ? `Connected${cal.calendar.syncedAt ? `, synced ${clock(cal.calendar.syncedAt)}` : ''}.`
                      : 'Bring in your meetings and classes so Segue plans around them.'}
                </p>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setSheet(null);
                    navigate('calendar');
                  }}
                >
                  {cal.calendar.connected ? 'Manage Google Calendar' : 'Connect Google Calendar'}
                </button>
              </section>
            }
            onStartOver={() => void startOver()}
            onClose={() => setSheet(null)}
          />
        )}
      </div>
    </>
  );
}
