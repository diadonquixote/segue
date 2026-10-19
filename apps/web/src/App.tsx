import { useCallback, useEffect, useRef, useState } from 'react';
import type { FallbackOption, Plan } from '@segue/engine';
import { BlockForm, BlocksView } from './components/Blocks';
import { RerouteSheet, type RerouteChoices } from './components/RerouteSheet';
import { Today } from './components/Today';
import { clock, longDate } from './lib/format';
import { currentLocation } from './lib/location';
import { emptyDay, localDate, todayAt, utcOffsetMinutes, type DayState, type PlaceCache, type Settings, type StoredBlock } from './lib/model';
import { rerouteDay, type RerouteOutcome } from './lib/reroute';
import { DEFAULT_LOCATION, DEFAULT_SETTINGS, SEED_BLOCKS } from './lib/seed';
import { getItem, setItem } from './lib/store';

type View = 'today' | 'blocks';
type SheetState = { kind: 'reroute' } | { kind: 'block'; id: string | null } | null;

function usePersisted<T>(key: string, initial: T, ready: boolean): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  const first = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (first.current) {
      first.current = false;
      return;
    }
    void setItem(key, value);
  }, [key, value, ready]);
  return [value, setValue];
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [blocks, setBlocks] = usePersisted<StoredBlock[]>('blocks', [], ready);
  const [settings, setSettings] = usePersisted<Settings>('settings', DEFAULT_SETTINGS, ready);
  const [day, setDay] = usePersisted<DayState>('day', emptyDay(), ready);
  const [placeCache, setPlaceCache] = usePersisted<PlaceCache | undefined>('placeCache', undefined, ready);
  const [undo, setUndo] = useState<DayState | null>(null);
  const [view, setView] = useState<View>('today');
  const [sheet, setSheet] = useState<SheetState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<RerouteOutcome | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const now = useNow();

  // Load everything from the device first, so the app opens instantly offline.
  useEffect(() => {
    void (async () => {
      const [b, s, d, c] = await Promise.all([
        getItem<StoredBlock[]>('blocks'),
        getItem<Settings>('settings'),
        getItem<DayState>('day'),
        getItem<PlaceCache>('placeCache'),
      ]);
      setBlocks(b ?? SEED_BLOCKS);
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setDay(d && d.date === localDate() ? d : emptyDay());
      setPlaceCache(c);
      setReady(true);
      if (!b) await setItem('blocks', SEED_BLOCKS);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // A new day starts with a clean slate.
  useEffect(() => {
    if (ready && day.date !== localDate(now)) setDay(emptyDay(localDate(now)));
  }, [now, ready, day.date, setDay]);

  const run = useCallback(
    async (choices: RerouteChoices, opts: { autoAccept: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        const start = new Date();
        const endOfDay = todayAt(choices.endOfDay, start);
        if (Date.parse(endOfDay) <= start.getTime() + 15 * 60_000) {
          setError('That end time has already passed. Pick a later one.');
          return;
        }
        const located = choices.useLocation ? await currentLocation() : null;
        const location = located ?? settings.lastLocation ?? DEFAULT_LOCATION;
        const nextSettings: Settings = {
          ...settings,
          endOfDay: choices.endOfDay,
          energy: choices.energy,
          mode: choices.mode,
          lastLocation: location,
          lastLocationLabel: located ? `near you at ${clock(start.toISOString())}` : settings.lastLocationLabel,
        };
        setSettings(nextSettings);
        const outcome = await rerouteDay({
          blocks,
          day,
          placeCache,
          context: {
            now: start.toISOString(),
            endOfDay,
            location,
            energy: choices.energy,
            mode: choices.mode,
            utcOffsetMinutes: utcOffsetMinutes(start),
          },
        });
        if (!located && choices.useLocation) {
          outcome.warnings.unshift(
            settings.lastLocation
              ? "Couldn't get your location, so this uses where you last re-routed."
              : "Couldn't get your location, so this assumes Metro Manila. Allow location access for better places.",
          );
        }
        if (outcome.placeCache) setPlaceCache(outcome.placeCache);
        if (opts.autoAccept) {
          applyPlan(outcome, outcome.plan);
        } else {
          setProposal(outcome);
        }
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, day, placeCache, settings],
  );

  function applyPlan(outcome: RerouteOutcome, plan: Plan) {
    setUndo(day.plan ? day : null);
    setDay({
      ...day,
      plan,
      alternatives: outcome.alternatives,
      changes: plan === outcome.plan ? outcome.changes : [],
      generatedAt: new Date().toISOString(),
      source: outcome.source,
      warnings: outcome.warnings,
      lockedIds: day.lockedIds.filter((id) => plan.items.some((i) => i.blockId === id)),
    });
    setProposal(null);
    setSheet(null);
    setView('today');
    if (day.plan) setToast('Plan updated.');
  }

  // First open of the day: plan it straight away.
  const autoPlanned = useRef(false);
  useEffect(() => {
    if (!ready || autoPlanned.current || day.plan || !blocks.some((b) => b.active)) return;
    autoPlanned.current = true;
    void run({ endOfDay: settings.endOfDay, energy: settings.energy, mode: settings.mode, useLocation: true }, { autoAccept: true });
  }, [ready, day.plan, blocks, settings, run]);

  const mark = (field: 'doneIds' | 'skippedIds', id: string) => {
    setDay((d) => ({ ...d, [field]: [...new Set([...d[field], id])] }));
    setToast(field === 'doneIds' ? 'Marked done.' : 'Skipped for today.');
  };

  const toggleLock = (id: string) =>
    setDay((d) => ({ ...d, lockedIds: d.lockedIds.includes(id) ? d.lockedIds.filter((x) => x !== id) : [...d.lockedIds, id] }));

  const useFallback = (id: string, f: FallbackOption) =>
    setDay((d) => {
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

  const saveBlock = (b: StoredBlock) => {
    setBlocks((list) => (list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b]));
    setSheet(null);
    setToast('Block saved. Re-route to fit it in.');
  };

  const deleteBlock = (id: string) => {
    setBlocks((list) => list.filter((x) => x.id !== id));
    setSheet(null);
    setToast('Block deleted.');
  };

  if (!ready) return <div className="boot" aria-busy="true" />;

  const editing = sheet?.kind === 'block' ? blocks.find((b) => b.id === sheet.id) : undefined;

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1 className="wordmark">Segue</h1>
          <p className="date">{longDate(now)}</p>
        </div>
        <nav className="tabs" aria-label="Sections">
          <button type="button" aria-current={view === 'today' ? 'page' : undefined} onClick={() => setView('today')}>
            Today
          </button>
          <button type="button" aria-current={view === 'blocks' ? 'page' : undefined} onClick={() => setView('blocks')}>
            Blocks
          </button>
        </nav>
      </header>

      <main>
        {view === 'today' ? (
          <Today
            day={day}
            mode={settings.mode}
            now={now}
            onDone={(id) => mark('doneIds', id)}
            onSkip={(id) => mark('skippedIds', id)}
            onToggleLock={toggleLock}
            onUseFallback={useFallback}
            onReroute={() => setSheet({ kind: 'reroute' })}
            onEditBlocks={() => setView('blocks')}
          />
        ) : (
          <BlocksView
            blocks={blocks}
            onEdit={(id) => setSheet({ kind: 'block', id })}
            onAdd={() => setSheet({ kind: 'block', id: null })}
            onToggle={(id) => setBlocks((list) => list.map((b) => (b.id === id ? { ...b, active: !b.active } : b)))}
          />
        )}
        {view === 'today' && day.generatedAt && (
          <p className="muted small stamp">
            Planned at {clock(day.generatedAt)} {day.source === 'device' ? 'on your phone' : ''}
            {undo && (
              <>
                {' · '}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setDay(undo);
                    setUndo(null);
                    setToast('Previous plan restored.');
                  }}
                >
                  Undo re-route
                </button>
              </>
            )}
          </p>
        )}
      </main>

      <div className="dock">
        <button
          type="button"
          className="reroute"
          disabled={busy}
          onClick={() => {
            setProposal(null);
            setError(null);
            setSheet({ kind: 'reroute' });
          }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 7h9a4 4 0 0 1 0 8H8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M11 12l-3 3 3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {busy ? 'Rebuilding…' : 'Re-route from here'}
        </button>
      </div>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      {sheet?.kind === 'reroute' && (
        <RerouteSheet
          settings={settings}
          busy={busy}
          error={error}
          proposal={proposal}
          onRun={(c) => void run(c, { autoAccept: !day.plan })}
          onAccept={(plan) => proposal && applyPlan(proposal, plan)}
          onClose={() => {
            setSheet(null);
            setProposal(null);
          }}
        />
      )}
      {sheet?.kind === 'block' && (
        <BlockForm initial={editing} onSave={saveBlock} onDelete={deleteBlock} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
