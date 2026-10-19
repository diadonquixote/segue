import { useState } from 'react';
import type { FallbackOption, PlanItem, TravelMode } from '@segue/engine';
import { clock, clockParts, directionsUrl, duration, minutesBetween, travelLine } from '../lib/format';
import type { DayState } from '../lib/model';

interface Props {
  day: DayState;
  mode: TravelMode;
  now: Date;
  onDone: (id: string) => void;
  onSkip: (id: string) => void;
  onToggleLock: (id: string) => void;
  onUseFallback: (id: string, f: FallbackOption) => void;
  onReroute: () => void;
  onEditBlocks: () => void;
}

function Confidence({ item }: { item: PlanItem }) {
  if (item.confidence === 'no-place') return null;
  return item.confidence === 'verified' ? (
    <span className="conf conf-ok" title="Open for the whole slot">
      <span className="dot" aria-hidden="true" />
      Open then
    </span>
  ) : (
    <span className="conf conf-unknown" title="Opening hours not confirmed">
      <span className="dot" aria-hidden="true" />
      Hours unconfirmed
    </span>
  );
}

/** Hero version: the two things you do next, with everything else one tap away. */
function HeroActions({ item, locked, props }: { item: PlanItem; locked: boolean; props: Props }) {
  const [more, setMore] = useState(false);
  const directions = directionsUrl(item);
  return (
    <div className="detail">
      {item.explanation && item.place && <p className="why">{item.explanation}</p>}
      <div className="row-actions">
        <button type="button" className="primary" onClick={() => props.onDone(item.blockId)}>
          Mark done
        </button>
        {directions && (
          <a className="ghost tall" href={directions} target="_blank" rel="noreferrer">
            Directions
          </a>
        )}
        <button type="button" className="ghost tall" aria-expanded={more} onClick={() => setMore(!more)}>
          {more ? 'Fewer options' : 'Other options'}
        </button>
      </div>
      {more && <ItemDetail item={item} locked={locked} props={props} hideExplanation hideDone />}
    </div>
  );
}

function ItemDetail({
  item,
  locked,
  props,
  hideExplanation,
  hideDone,
}: {
  item: PlanItem;
  locked: boolean;
  props: Props;
  hideExplanation?: boolean;
  hideDone?: boolean;
}) {
  const directions = hideDone ? null : directionsUrl(item);
  return (
    <div className="detail">
      {item.explanation && !hideExplanation && <p className="why">{item.explanation}</p>}
      {item.fallbacks.length > 0 && (
        <div className="fallbacks">
          <p className="muted small">If this doesn't work out</p>
          <ul>
            {item.fallbacks.map((f) => (
              <li key={f.label}>
                <span>{f.label}</span>
                <button type="button" className="text-button" onClick={() => props.onUseFallback(item.blockId, f)}>
                  Use instead
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="row-actions">
        {!hideDone && (
          <button type="button" className="ghost" onClick={() => props.onDone(item.blockId)}>
            Mark done
          </button>
        )}
        <button type="button" className="ghost" onClick={() => props.onSkip(item.blockId)}>
          Skip today
        </button>
        {!item.fixed && (
          <button type="button" className="ghost" aria-pressed={locked} onClick={() => props.onToggleLock(item.blockId)}>
            {locked ? 'Unpin' : 'Pin this time'}
          </button>
        )}
        {directions && (
          <a className="ghost" href={directions} target="_blank" rel="noreferrer">
            Directions
          </a>
        )}
      </div>
    </div>
  );
}

export function Today(props: Props) {
  const { day, now, mode } = props;
  const [open, setOpen] = useState<string | null>(null);
  const finished = new Set([...day.doneIds, ...day.skippedIds]);
  const items = (day.plan?.items ?? []).filter((i) => !finished.has(i.blockId));
  const upcoming = items.filter((i) => Date.parse(i.end) > now.getTime());
  const [next, ...rest] = upcoming;
  const locked = new Set(day.lockedIds);

  if (!day.plan) {
    return (
      <section className="empty">
        <p className="lede">Your day isn't planned yet.</p>
        <p className="muted">Segue arranges your blocks around where you are and what's open.</p>
        <button type="button" className="primary" onClick={props.onReroute}>
          Plan my day
        </button>
      </section>
    );
  }

  const nowLive = next && Date.parse(next.start) <= now.getTime();
  const nextTime = next ? clockParts(next.start) : null;

  return (
    <>
      {day.warnings.length > 0 && (
        <div className="notice" role="status">
          {day.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}

      {next ? (
        <section className="hero" aria-labelledby="next-title">
          <p className="hero-when">
            {nowLive ? (
              <span className="live">Now, until {clock(next.end)}</span>
            ) : (
              <>
                <span className="hero-time">{nextTime!.time}</span>
                <span className="hero-period">{nextTime!.period}</span>
              </>
            )}
          </p>
          <h2 id="next-title" className="hero-title">
            {next.title}
          </h2>
          <p className="hero-place">
            {next.place ? next.place.name : (next.explanation ?? 'Wherever you are')}
            {next.place && travelLine(next, mode) && <span className="muted"> · {travelLine(next, mode)}</span>}
          </p>
          <p className="hero-meta">
            <span>{duration(minutesBetween(next.start, next.end))}</span>
            <Confidence item={next} />
            {locked.has(next.blockId) && <span className="pin">Pinned</span>}
          </p>
          <HeroActions item={next} locked={locked.has(next.blockId)} props={props} />
        </section>
      ) : (
        <section className="empty">
          <p className="lede">That's everything planned for today.</p>
          <p className="muted">Add a block or re-route if something new came up.</p>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-label="Later today">
          <h3 className="section-title">Later today</h3>
          <ol className="stave">
            {rest.map((item) => {
              const isOpen = open === item.blockId;
              const travel = travelLine(item, mode);
              return (
                <li key={item.blockId} className={isOpen ? 'open' : ''}>
                  <button
                    type="button"
                    className="stave-row"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : item.blockId)}
                  >
                    <span className="stave-time">{clock(item.start)}</span>
                    <span className="stave-body">
                      <span className="stave-title">
                        {item.title}
                        {item.fixed && <span className="tag">Fixed</span>}
                        {locked.has(item.blockId) && <span className="tag">Pinned</span>}
                      </span>
                      <span className="stave-sub">
                        {item.place ? item.place.name : (item.explanation ?? 'Anywhere')}
                        {travel && ` · ${travel}`}
                      </span>
                    </span>
                    <span className="stave-dur">{duration(minutesBetween(item.start, item.end))}</span>
                  </button>
                  {isOpen && <ItemDetail item={item} locked={locked.has(item.blockId)} props={props} />}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {day.plan.unscheduled.length > 0 && (
        <section aria-label="Didn't fit today">
          <h3 className="section-title">Didn't fit today</h3>
          <ul className="unfit">
            {day.plan.unscheduled
              .filter((u) => !finished.has(u.blockId))
              .map((u) => (
                <li key={u.blockId}>
                  <strong>{u.title}</strong>
                  <span className="muted">{u.reason}</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {(day.doneIds.length > 0 || day.skippedIds.length > 0) && (
        <p className="muted small tally">
          {day.doneIds.length} done{day.skippedIds.length ? `, ${day.skippedIds.length} skipped` : ''} today.
        </p>
      )}
    </>
  );
}
