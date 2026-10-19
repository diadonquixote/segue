import { useState } from 'react';
import type { Energy, Plan, TravelMode } from '@segue/engine';
import { clock } from '../lib/format';
import { ENERGY_LABEL, MODE_LABEL, type Settings } from '../lib/model';
import type { RerouteOutcome } from '../lib/reroute';
import { Segmented, Sheet } from './Sheet';

export interface RerouteChoices {
  endOfDay: string;
  energy: Energy;
  mode: TravelMode;
  useLocation: boolean;
}

interface Props {
  settings: Settings;
  busy: boolean;
  error: string | null;
  proposal: RerouteOutcome | null;
  onRun: (c: RerouteChoices) => void;
  onAccept: (plan: Plan) => void;
  onClose: () => void;
}

const CHANGE_WORD = { added: 'New', removed: 'Dropped', moved: 'Moved', 'place-changed': 'New place', unchanged: '' } as const;

function Proposal({ proposal, onAccept }: { proposal: RerouteOutcome; onAccept: (p: Plan) => void }) {
  const options = [proposal.plan, ...proposal.alternatives];
  const [pick, setPick] = useState(0);
  const chosen = options[pick]!;
  const changes = pick === 0 ? proposal.changes.filter((c) => c.kind !== 'unchanged') : [];

  return (
    <div className="proposal">
      {proposal.warnings.map((w) => (
        <p key={w} className="notice">
          {w}
        </p>
      ))}

      {options.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Plan options">
          {options.map((p, i) => (
            <button key={p.label} type="button" role="tab" aria-selected={pick === i} className={pick === i ? 'on' : ''} onClick={() => setPick(i)}>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {changes.length > 0 && (
        <ul className="changes">
          {changes.map((c) => (
            <li key={c.blockId}>
              <span className={`change change-${c.kind}`}>{CHANGE_WORD[c.kind]}</span>
              <span>
                <strong>{c.title}</strong> {c.message.charAt(0).toLowerCase() + c.message.slice(1)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ol className="preview">
        {chosen.items.map((i) => (
          <li key={i.blockId}>
            <span className="stave-time">{clock(i.start)}</span>
            <span>
              {i.title}
              <span className="muted"> · {i.place?.name ?? 'anywhere'}</span>
            </span>
          </li>
        ))}
      </ol>
      {chosen.unscheduled.length > 0 && (
        <p className="muted small">Won't fit: {chosen.unscheduled.map((u) => u.title).join(', ')}</p>
      )}
      <p className="muted small">{chosen.totalTravelMinutes} min of travel in total.</p>

      <button type="button" className="primary wide" onClick={() => onAccept(chosen)}>
        Use this plan
      </button>
    </div>
  );
}

export function RerouteSheet({ settings, busy, error, proposal, onRun, onAccept, onClose }: Props) {
  const [c, setC] = useState<RerouteChoices>({
    endOfDay: settings.endOfDay,
    energy: settings.energy,
    mode: settings.mode,
    useLocation: true,
  });

  return (
    <Sheet title={proposal ? 'Your new plan' : 'Re-route from here'} onClose={onClose}>
      {proposal ? (
        <Proposal proposal={proposal} onAccept={onAccept} />
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            onRun(c);
          }}
        >
          <label className="check">
            <input type="checkbox" checked={c.useLocation} onChange={(e) => setC({ ...c, useLocation: e.target.checked })} />
            <span>
              Use my current location
              {!c.useLocation && settings.lastLocationLabel && <span className="muted"> (last: {settings.lastLocationLabel})</span>}
            </span>
          </label>

          <label className="field">
            <span>Day ends at</span>
            <input type="time" value={c.endOfDay} onChange={(e) => setC({ ...c, endOfDay: e.target.value })} required />
          </label>

          <Segmented
            label="Energy right now"
            value={c.energy}
            onChange={(energy) => setC({ ...c, energy })}
            options={(['low', 'medium', 'high'] as const).map((v) => ({ value: v, label: ENERGY_LABEL[v] }))}
          />

          <label className="field">
            <span>Getting around</span>
            <select value={c.mode} onChange={(e) => setC({ ...c, mode: e.target.value as TravelMode })}>
              {(Object.keys(MODE_LABEL) as TravelMode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="primary wide" disabled={busy}>
            {busy ? 'Rebuilding…' : 'Rebuild my day'}
          </button>
        </form>
      )}
    </Sheet>
  );
}
