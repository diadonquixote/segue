import { useEffect, useMemo, useRef, useState } from 'react';
import type { StoredBlock } from '../lib/model';
import { parseQuickAdd } from '../lib/quickAdd';
import { askSmartAdd, smartAddAvailable } from '../lib/smartAdd';

export const EXAMPLES = ['Deep work 2h wifi', 'Lunch 12:30', 'Gym after 5pm', 'Groceries before 8', 'Call mom 20 min'];

interface Props {
  onAdd: (blocks: StoredBlock[]) => void;
  /** opens the full form with what was typed so far */
  onMore?: (draft: StoredBlock) => void;
  /** text to start with, e.g. "after 3:30 PM" from a free gap; `n` changes on every tap */
  seed?: { text: string; n: number };
  showExamples?: boolean;
  autoFocus?: boolean;
  now: Date;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function QuickAdd({ onAdd, onMore, seed, showExamples, autoFocus, now }: Props) {
  const [text, setText] = useState('');
  const [smart, setSmart] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<StoredBlock[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void smartAddAvailable().then(setSmart);
  }, []);

  // A new seed (from tapping a free gap) replaces what's there and puts the cursor at the start.
  useEffect(() => {
    if (!seed) return;
    setText(` ${seed.text}`);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(0, 0);
    });
  }, [seed?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text, now) : null), [text, now]);

  function add() {
    if (!parsed) return;
    onAdd([parsed.block]);
    setText('');
    setSuggested(null);
    setError(null);
  }

  async function ask() {
    setAsking(true);
    setError(null);
    try {
      setSuggested(await askSmartAdd(text.trim(), now));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="quick-add">
      <form
        className="quick-row"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <label className="visually-hidden" htmlFor="quick-add">
          Add something to today
        </label>
        <input
          id="quick-add"
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSuggested(null);
            setError(null);
          }}
          placeholder="Add something… e.g. Gym 1h after 5pm"
          autoComplete="off"
          enterKeyHint="done"
          maxLength={500}
          autoFocus={autoFocus}
        />
        <button type="submit" className="quick-go" disabled={!parsed} aria-label="Add">
          <PlusIcon />
        </button>
      </form>

      {parsed && !suggested && (
        <div className="quick-preview" aria-live="polite">
          <span className="quick-title">{parsed.block.title}</span>
          <span className="chips">
            {parsed.chips.map((c) => (
              <span key={c} className="chip static">
                {c}
              </span>
            ))}
          </span>
          <span className="quick-actions">
            {!parsed.confident && smart && (
              <button type="button" className="text-button" onClick={() => void ask()} disabled={asking}>
                {asking ? 'Reading…' : 'Let Segue read it'}
              </button>
            )}
            {onMore && (
              <button type="button" className="text-button" onClick={() => onMore(parsed.block)}>
                More options
              </button>
            )}
          </span>
        </div>
      )}

      {suggested && (
        <div className="quick-preview" aria-live="polite">
          <p className="muted small">Segue read {suggested.length === 1 ? 'one thing' : `${suggested.length} things`}:</p>
          <ul className="suggested">
            {suggested.map((b) => (
              <li key={b.id}>
                <strong>{b.title}</strong>
                <span className="muted small">
                  {b.fixedStart ? ` ${b.fixedStart}–${b.fixedEnd}` : ` ${b.maxMinutes} min`}
                  {b.earliest && ` · after ${b.earliest}`}
                  {b.latest && ` · before ${b.latest}`}
                </span>
              </li>
            ))}
          </ul>
          <div className="row-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                onAdd(suggested);
                setSuggested(null);
                setText('');
              }}
            >
              Add {suggested.length === 1 ? 'it' : 'all'}
            </button>
            <button type="button" className="ghost" onClick={() => setSuggested(null)}>
              Not quite
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {showExamples && !text && (
        <div className="chips examples" aria-label="Examples">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              className="chip"
              onClick={() => {
                setText(e);
                input.current?.focus();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
