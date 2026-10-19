/**
 * Parser for the common subset of OpenStreetMap `opening_hours` values.
 *
 * Handles: "24/7", weekday ranges and lists ("Mo-Fr", "Sa,Su", "Fr-Mo"),
 * multiple time spans ("08:00-12:00,13:00-17:00"), "off"/"closed", rules
 * without days (every day), and later rules overriding earlier ones.
 * Anything fancier (months, week numbers, sunrise, public-holiday logic)
 * returns null — the engine then treats hours as unknown rather than guessing.
 */
import type { OpeningHours, OpeningPeriod } from '@segue/engine';

const DAYS: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const DAY_TOKEN = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/;
const SPAN = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/;

function expandDays(spec: string): number[] | null {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = DAY_TOKEN.exec(part.trim());
    if (!m) return null;
    const a = DAYS[m[1]!]!;
    const b = m[2] ? DAYS[m[2]]! : a;
    for (let d = a; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === b) break;
    }
  }
  return [...out];
}

const pad = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

function parseSpans(spec: string): { open: string; close: string }[] | null {
  const spans: { open: string; close: string }[] = [];
  for (const part of spec.split(',')) {
    const m = SPAN.exec(part.trim());
    if (!m) return null;
    let [oh, om, ch, cm] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (oh > 24 || ch > 48 || om > 59 || cm > 59) return null;
    if (ch >= 24 && !(ch === 24 && cm === 0)) ch -= 24; // "22:00-26:00" style
    spans.push({ open: pad(oh, om), close: pad(ch, cm) });
  }
  return spans;
}

export function parseOsmOpeningHours(raw: string | undefined | null): OpeningHours | null {
  if (!raw) return null;
  const value = raw.trim().replace(/\s+/g, ' ');
  if (value === '24/7') return { always: true, periods: [] };

  const byDay = new Map<number, { open: string; close: string }[]>();
  for (const ruleRaw of value.split(';')) {
    const rule = ruleRaw.trim();
    if (!rule) continue;
    if (/^PH\b/.test(rule)) continue; // public-holiday rules: ignore
    const tokens = rule.split(' ');
    let days: number[] = [0, 1, 2, 3, 4, 5, 6];
    let rest = rule;
    const first = tokens[0]!;
    if (/^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(first)) {
      const d = expandDays(first.replace(/,PH$/, ''));
      if (!d) return null;
      days = d;
      rest = tokens.slice(1).join(' ');
    }
    rest = rest.trim();
    if (rest === 'off' || rest === 'closed') {
      for (const d of days) byDay.set(d, []);
      continue;
    }
    if (rest === '00:00-24:00' || rest === '24/7') {
      for (const d of days) byDay.set(d, [{ open: '00:00', close: '24:00' }]);
      continue;
    }
    const spans = parseSpans(rest);
    if (!spans) return null;
    for (const d of days) byDay.set(d, spans);
  }
  if (byDay.size === 0) return null;
  const periods: OpeningPeriod[] = [];
  for (const [day, spans] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    for (const s of spans) periods.push({ day, ...s });
  }
  if (periods.length === 7 && periods.every((p) => p.open === '00:00' && p.close === '24:00')) {
    return { always: true, periods: [] };
  }
  return { periods };
}
