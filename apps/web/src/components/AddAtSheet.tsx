import { useMemo, useState } from 'react';
import { clock } from '../lib/format';
import { todayAt, type StoredBlock } from '../lib/model';
import { parseQuickAdd } from '../lib/quickAdd';
import { Segmented, Sheet } from './Sheet';

interface Props {
  /** "15:00" */
  at: string;
  now: Date;
  onAdd: (blocks: StoredBlock[]) => void;
  onClose: () => void;
}

/** Add something at a tapped hour: starting right then, or any time after. */
export function AddAtSheet({ at, now, onAdd, onClose }: Props) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'at' | 'after'>('at');
  const label = clock(todayAt(at, now));

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    // A time the user typed ("Gym at 5pm", "before 8") wins over the tapped hour.
    // A meal's usual window ("dinner": 6 to 9:30 PM) doesn't count as typed.
    const own = parseQuickAdd(text, now);
    const hasTime = !!own.block.fixedStart || own.chips.some((c) => /^(After|Before) /.test(c));
    return hasTime ? own : parseQuickAdd(`${text} ${mode === 'at' ? 'at' : 'after'} ${at}`, now);
  }, [text, mode, at, now]);

  return (
    <Sheet title={`Add at ${label}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed) onAdd([parsed.block]);
        }}
      >
        <label className="field">
          <span>What is it?</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Coffee with Ana 45 min" autoFocus autoComplete="off" maxLength={500} />
        </label>
        <Segmented
          label="When"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'at', label: `Starts at ${label}` },
            { value: 'after', label: 'Any time after' },
          ]}
        />
        {parsed && (
          <div className="quick-preview" aria-live="polite">
            <span className="quick-title">{parsed.block.title}</span>
            <span className="chips">
              {parsed.chips.map((c) => (
                <span key={c} className="chip static">
                  {c}
                </span>
              ))}
            </span>
          </div>
        )}
        <p className="muted small">
          {mode === 'at' ? 'It stays at this time, and the rest of the day is planned around it.' : 'Segue picks the best time after this, where it fits.'}
        </p>
        <button type="submit" className="primary wide" disabled={!parsed}>
          Add
        </button>
      </form>
    </Sheet>
  );
}
