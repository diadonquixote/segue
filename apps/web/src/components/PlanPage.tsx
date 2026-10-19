import type { ReactNode } from 'react';
import type { Energy, PlanItem, TravelMode } from '@segue/engine';
import { calendarBlockId, isCalendarBlock, type CalendarEvent } from '../lib/calendar';
import { clock, duration, longDate, minutesBetween } from '../lib/format';
import { CATEGORY_LABEL, ENERGY_LABEL, MODE_LABEL, PRIORITY_LABEL, todayAt, type DayState, type Settings, type StoredBlock } from '../lib/model';
import { Segmented } from './Sheet';

interface Props {
  now: Date;
  today: string;
  day: DayState;
  blocks: StoredBlock[];
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  calendarConnected: boolean;
  calendarEvents: CalendarEvent[];
  excluded: Set<string>;
  onToggleExclude: (id: string) => void;
  /** the quick-add bar */
  adder: ReactNode;
  onRemoveBlock: (id: string) => void;
  onEditBlock: (id: string) => void;
  onOpenCalendar: () => void;
  onPlan: () => void;
  busy: boolean;
}

const HOUR_PX = 56;

/** The whole day on an hour grid: what's planned, with a line for now. */
function DayGlance({ items, now, endOfDay }: { items: PlanItem[]; now: Date; endOfDay: string }) {
  const startMs = Math.min(now.getTime(), ...items.map((i) => Date.parse(i.start)));
  const endMs = Math.max(Date.parse(endOfDay), ...items.map((i) => Date.parse(i.end)));
  const first = new Date(startMs);
  first.setMinutes(0, 0, 0);
  const hours = Math.max(1, Math.ceil((endMs - first.getTime()) / 3_600_000));
  const y = (ms: number) => ((ms - first.getTime()) / 3_600_000) * HOUR_PX;
  const nowY = y(now.getTime());

  return (
    <div className="glance" style={{ height: hours * HOUR_PX }} aria-label="Your day at a glance" role="img">
      {Array.from({ length: hours + 1 }, (_, h) => {
        const t = new Date(first.getTime() + h * 3_600_000);
        return (
          <div key={h} className="glance-hour" style={{ top: h * HOUR_PX }}>
            <span>{clock(t.toISOString()).replace(':00', '')}</span>
          </div>
        );
      })}
      {items.map((i) => {
        const top = y(Date.parse(i.start));
        const height = Math.max(24, y(Date.parse(i.end)) - top - 2);
        const travel = i.travelMinutesBefore * (HOUR_PX / 60);
        return (
          <div key={i.blockId}>
            {travel >= 6 && <div className="glance-travel" style={{ top: top - travel, height: travel }} />}
            <div
              className={`glance-item${isCalendarBlock(i.blockId) ? ' cal' : i.fixed ? ' fixed' : ''}`}
              style={{ top, height }}
              title={`${clock(i.start)}–${clock(i.end)} ${i.title}`}
            >
              <strong>{i.title}</strong>
              {height >= 40 && <span>{i.place?.name ?? clock(i.start)}</span>}
            </div>
          </div>
        );
      })}
      {nowY >= 0 && nowY <= hours * HOUR_PX && <div className="glance-now" style={{ top: nowY }} />}
    </div>
  );
}

export function PlanPage(props: Props) {
  const { now, today, day, blocks, settings, excluded } = props;
  const oneOffs = blocks.filter((b) => b.date === today);
  const routines = blocks.filter((b) => !b.date);
  const inToday = [...oneOffs.filter((b) => b.active), ...routines.filter((b) => b.active && !excluded.has(b.id))];
  const events = props.calendarEvents.filter((e) => !excluded.has(calendarBlockId(e.id)));

  const endOfDay = todayAt(settings.endOfDay, now);
  const available = Math.max(0, minutesBetween(now.toISOString(), endOfDay));
  const wanted =
    inToday.reduce((s, b) => s + (b.fixedStart ? 0 : b.minMinutes), 0) +
    [...inToday.filter((b) => b.fixedStart), ...events].reduce(
      (s, x) => s + ('start' in x ? minutesBetween(x.start, x.end) : x.maxMinutes),
      0,
    );
  const count = inToday.length + events.length;
  const tooMuch = wanted > available;

  return (
    <div className="page plan-page">
      <header className="page-head plain">
        <div>
          <h2 className="page-title">Plan your day</h2>
          <p className="muted">{longDate(now)} · choose what's in today, then let Segue fit it together.</p>
        </div>
      </header>

      <section className="panel">
        <h3 className="panel-title">How's today looking?</h3>
        <div className="pair">
          <label className="field">
            <span>Day ends around</span>
            <input type="time" value={settings.endOfDay} onChange={(e) => e.target.value && props.onSettings({ endOfDay: e.target.value })} />
          </label>
          <label className="field">
            <span>Getting around</span>
            <select value={settings.mode} onChange={(e) => props.onSettings({ mode: e.target.value as TravelMode })}>
              {(Object.keys(MODE_LABEL) as TravelMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Segmented
          label="How are you feeling?"
          value={settings.energy}
          onChange={(energy: Energy) => props.onSettings({ energy })}
          options={(['low', 'medium', 'high'] as const).map((v) => ({ value: v, label: ENERGY_LABEL[v] }))}
        />
      </section>

      <section className="panel">
        <div className="panel-row">
          <h3 className="panel-title">On your calendar</h3>
          <button type="button" className="text-button" onClick={props.onOpenCalendar}>
            {props.calendarConnected ? 'Manage' : 'Connect'}
          </button>
        </div>
        {!props.calendarConnected ? (
          <p className="muted small">Connect Google Calendar and your meetings and classes become fixed times Segue plans around.</p>
        ) : props.calendarEvents.length === 0 ? (
          <p className="muted small">Nothing from your calendar today.</p>
        ) : (
          <ul className="pick-list">
            {props.calendarEvents.map((e) => {
              const id = calendarBlockId(e.id);
              return (
                <li key={e.id} className={excluded.has(id) ? 'off' : ''}>
                  <span className="pick-time">{clock(e.start)}</span>
                  <span className="pick-body">
                    <strong>{e.title}</strong>
                    <span className="muted small">
                      {duration(minutesBetween(e.start, e.end))}
                      {e.location && ` · ${e.location}`}
                    </span>
                  </span>
                  <label className="switch">
                    <input type="checkbox" checked={!excluded.has(id)} onChange={() => props.onToggleExclude(id)} />
                    <span className="visually-hidden">Plan around {e.title} today</span>
                    <span className="track" aria-hidden="true" />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3 className="panel-title">Just for today</h3>
        {props.adder}
        {oneOffs.length > 0 && (
          <ul className="pick-list">
            {oneOffs.map((b) => (
              <li key={b.id}>
                <span className="pick-time">{b.fixedStart ? clock(todayAt(b.fixedStart, now)) : duration(b.maxMinutes)}</span>
                <button type="button" className="pick-body as-button" onClick={() => props.onEditBlock(b.id)}>
                  <strong>{b.title}</strong>
                  <span className="muted small">
                    {b.fixedStart ? `Until ${clock(todayAt(b.fixedEnd!, now))}` : CATEGORY_LABEL[b.category]}
                    {b.priority !== 'should' && ` · ${PRIORITY_LABEL[b.priority]}`}
                  </span>
                </button>
                <button type="button" className="text-button" onClick={() => props.onRemoveBlock(b.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h3 className="panel-title">Routines</h3>
        {routines.length === 0 ? (
          <p className="muted small">No routines yet. Add things you do most days in Routines.</p>
        ) : (
          <ul className="pick-list">
            {routines.map((b) => {
              const paused = !b.active;
              const off = paused || excluded.has(b.id);
              return (
                <li key={b.id} className={off ? 'off' : ''}>
                  <span className="pick-time">{b.fixedStart ? clock(todayAt(b.fixedStart, now)) : duration(b.maxMinutes)}</span>
                  <span className="pick-body">
                    <strong>{b.title}</strong>
                    <span className="muted small">{paused ? 'Paused in Routines' : CATEGORY_LABEL[b.category]}</span>
                  </span>
                  <label className="switch">
                    <input type="checkbox" checked={!off} disabled={paused} onChange={() => props.onToggleExclude(b.id)} />
                    <span className="visually-hidden">Include {b.title} today</span>
                    <span className="track" aria-hidden="true" />
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {day.plan && day.plan.items.length > 0 && (
        <section className="panel">
          <div className="panel-row">
            <h3 className="panel-title">Your day at a glance</h3>
            <span className="muted small">{day.plan.totalTravelMinutes} min travel</span>
          </div>
          <DayGlance items={day.plan.items.filter((i) => !day.doneIds.includes(i.blockId) && !day.skippedIds.includes(i.blockId))} now={now} endOfDay={endOfDay} />
        </section>
      )}

      <div className="plan-bar">
        <p className={tooMuch ? 'plan-sum warn-text' : 'plan-sum'}>
          {count === 0
            ? 'Add something to plan.'
            : `${count} ${count === 1 ? 'thing' : 'things'} · about ${duration(Math.max(5, wanted))} of ${duration(available)} left`}
          {tooMuch && count > 0 && <span className="block small">More than fits. Must-dos go first.</span>}
        </p>
        <button type="button" className="primary big" onClick={props.onPlan} disabled={props.busy || count === 0}>
          {props.busy ? 'Planning…' : day.plan ? 'Re-plan my day' : 'Plan my day'}
        </button>
      </div>
    </div>
  );
}
