import { useEffect } from 'react';
import { calendarBlockId, type CalendarState } from '../lib/calendar';
import { clock, duration, minutesBetween } from '../lib/format';
import { GOOGLE_CLIENT_ID, preloadGoogle } from '../lib/googleCalendar';

interface Props {
  calendar: CalendarState;
  today: string;
  busy: boolean;
  error: string | null;
  excluded: Set<string>;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
  onToggleExclude: (blockId: string) => void;
  onBack: () => void;
  onPlan: () => void;
}

function CalendarGlyph({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <rect x="5" y="9" width="38" height="34" rx="8" fill="var(--surface)" stroke="currentColor" strokeWidth="3" />
      <path d="M5 19h38" stroke="currentColor" strokeWidth="3" />
      <path d="M15 5v8M33 5v8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <rect x="13" y="25" width="8" height="7" rx="2" fill="var(--brass)" />
      <rect x="25" y="25" width="8" height="7" rx="2" fill="currentColor" opacity=".25" />
      <rect x="13" y="34" width="8" height="4" rx="2" fill="currentColor" opacity=".25" />
    </svg>
  );
}

const PROMISES = [
  { title: 'Reads, never writes', body: "Segue only looks at today's events. It can't create, change or delete anything in your calendar." },
  { title: 'Plans around what makes you busy', body: 'Meetings and classes become fixed times. Events marked "free", ones you declined, cancelled ones and all-day events are left out.' },
  { title: 'Every calendar you have switched on', body: 'Work, personal and shared calendars all count. A meeting that is on two of them shows up once.' },
  { title: 'Stays on your phone', body: "Google's sign-in happens in your browser and lasts about an hour. Segue's server never sees it." },
];

export function CalendarPage(props: Props) {
  const { calendar, today, busy, error, excluded } = props;
  const events = calendar.date === today ? calendar.events : [];

  // Load Google's sign-in early so the popup opens straight from the tap.
  useEffect(() => {
    if (GOOGLE_CLIENT_ID) preloadGoogle().catch(() => {});
  }, []);

  return (
    <div className="page calendar-page">
      <button type="button" className="back" onClick={props.onBack}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </button>

      <header className="page-head">
        <CalendarGlyph />
        <div>
          <h2 className="page-title">Google Calendar</h2>
          <p className="muted">
            {calendar.connected
              ? calendar.date === today && calendar.syncedAt
                ? `Connected · synced ${clock(calendar.syncedAt)}`
                : 'Connected · not synced today yet'
              : "Bring today's meetings and classes into your plan."}
          </p>
        </div>
      </header>

      {!GOOGLE_CLIENT_ID ? (
        <section className="panel">
          <h3 className="panel-title">Not set up on this version of Segue</h3>
          <p className="muted">
            {import.meta.env?.DEV ? (
              <>
                Add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>apps/web/.env</code> and restart the web app. The README explains how to get one.
              </>
            ) : (
              "Connecting Google Calendar isn't available here yet. You can still add meetings by typing them, like “Standup 9:30-10”."
            )}
          </p>
        </section>
      ) : !calendar.connected ? (
        <>
          <ul className="promises">
            {PROMISES.map((p) => (
              <li key={p.title}>
                <strong>{p.title}</strong>
                <span className="muted">{p.body}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="primary wide big" onClick={props.onConnect} disabled={busy}>
            {busy ? 'Waiting for Google…' : 'Connect Google Calendar'}
          </button>
          <p className="muted small center">
            Google will ask you to choose an account and allow read-only access. You can disconnect any time.
          </p>
        </>
      ) : (
        <>
          <section className="panel">
            <div className="panel-row">
              <h3 className="panel-title">Today</h3>
              <button type="button" className="ghost" onClick={props.onSync} disabled={busy}>
                {busy ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
            {calendar.date !== today ? (
              <p className="muted">Sync to bring in today's events.</p>
            ) : events.length === 0 ? (
              <p className="muted">Nothing on your calendar today. The whole day is yours to plan.</p>
            ) : (
              <ul className="event-list">
                {events.map((e) => {
                  const id = calendarBlockId(e.id);
                  const off = excluded.has(id);
                  return (
                    <li key={e.id} className={off ? 'off' : ''}>
                      <span className="event-time">
                        {clock(e.start)}
                        <span className="muted small">{duration(minutesBetween(e.start, e.end))}</span>
                      </span>
                      <span className="event-body">
                        <strong>{e.title}</strong>
                        {e.location && <span className="muted small">{e.location}</span>}
                        {off && <span className="small warn-text">Left out of today's plan</span>}
                      </span>
                      <label className="switch" title={off ? 'Plan around it' : 'Leave it out today'}>
                        <input type="checkbox" checked={!off} onChange={() => props.onToggleExclude(id)} />
                        <span className="visually-hidden">Plan around {e.title}</span>
                        <span className="track" aria-hidden="true" />
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <button type="button" className="primary wide big" onClick={props.onPlan}>
            Plan my day around it
          </button>

          <section className="panel subtle">
            <h3 className="panel-title">How Segue uses it</h3>
            <ul className="plain-list">
              {PROMISES.map((p) => (
                <li key={p.title}>{p.body}</li>
              ))}
            </ul>
            <button type="button" className="text-button danger-text" onClick={props.onDisconnect} disabled={busy}>
              Disconnect Google Calendar
            </button>
          </section>
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
