import type { Precaution, PrecautionKind } from '../lib/precautions';

const ICONS: Record<PrecautionKind, string> = {
  umbrella: 'M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9zM12 12v7a2 2 0 0 0 4 0',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  heat: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0zM12 10v6',
  drive: 'M5 16V11l2-5h10l2 5v5M5 16h14M5 16v2M19 16v2M7.5 13.5h.01M16.5 13.5h.01M5 11h14',
  flood: 'M3 10c2 0 2-1.5 4.5-1.5S9.5 10 12 10s2-1.5 4.5-1.5S19 10 21 10M3 15c2 0 2-1.5 4.5-1.5S9.5 15 12 15s2-1.5 4.5-1.5S19 15 21 15M3 20c2 0 2-1.5 4.5-1.5S9.5 20 12 20s2-1.5 4.5-1.5S19 20 21 20',
  storm: 'M7 15h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 15zM12 13l-2 4h3l-2 4',
  wind: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  cold: 'M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11',
  fog: 'M4 8h16M2 12h20M4 16h16M7 20h10',
};

export function PrecautionIcon({ kind, size = 22 }: { kind: PrecautionKind; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={ICONS[kind]} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** "Before you head out": what to bring and watch for, from the weather where you are. */
export function PrecautionsCard({ items, onDismiss }: { items: Precaution[]; onDismiss: () => void }) {
  if (!items.length) return null;
  const worst = items[0]!.level;
  return (
    <section className={`precautions level-${worst}`} aria-labelledby="precautions-title">
      <div className="precautions-head">
        <h3 id="precautions-title">{worst === 'danger' ? 'Take care out there' : 'Before you head out'}</h3>
        <button type="button" className="text-button" onClick={onDismiss}>
          Got it
        </button>
      </div>
      <ul>
        {items.map((p) => (
          <li key={p.kind} className={`precaution level-${p.level}`}>
            <span className="precaution-icon">
              <PrecautionIcon kind={p.kind} />
            </span>
            <span>
              <strong>{p.title}</strong>
              <span className="precaution-body">{p.body}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One line of chips, for the Plan screen. Tap for the reason. */
export function PrecautionStrip({ items }: { items: Precaution[] }) {
  if (!items.length) return null;
  return (
    <ul className="precaution-strip" aria-label="Weather precautions">
      {items.map((p) => (
        <li key={p.kind} className={`level-${p.level}`} title={p.body}>
          <PrecautionIcon kind={p.kind} size={16} />
          {p.title}
        </li>
      ))}
    </ul>
  );
}
