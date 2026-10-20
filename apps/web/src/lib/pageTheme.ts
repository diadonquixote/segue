/**
 * The page under the sky: its colours follow the sky and the time of day, so
 * the header, page, cards and sheets read as one scene. Pure, so contrast is
 * testable for every sky. When the sky is unknown the app keeps the CSS
 * defaults (and prefers-color-scheme), so this is only applied on top.
 */
import { hexRgb, mixRgb, type Rgb, type Tone } from './skyRenderer';
import type { DayPhase } from './sunTimes';

export type Mode = 'light' | 'dark';

/** The CSS custom properties the page is drawn with. Keep the bases in step with :root in styles.css. */
export type Tokens = Record<'fog' | 'surface' | 'ink' | 'slate' | 'line' | 'stave' | 'brass' | 'brass-ink' | 'brass-soft' | 'patina' | 'warn' | 'danger' | 'focus', string>;

const BASE: Record<Mode, Tokens> = {
  light: {
    fog: '#f2f4f8',
    surface: '#ffffff',
    ink: '#1b2240',
    slate: '#5b6383',
    line: '#d6dae6',
    stave: '#c3c9da',
    brass: '#c2912e',
    'brass-ink': '#1b2240',
    'brass-soft': '#f4e6c4',
    patina: '#2f6f6a',
    warn: '#9a5b12',
    danger: '#a33a3a',
    focus: '#3b5bdb',
  },
  dark: {
    fog: '#131933',
    surface: '#1b2244',
    ink: '#e9ecf5',
    slate: '#a2a9c4',
    line: '#2c3561',
    stave: '#39437a',
    brass: '#e0b04f',
    'brass-ink': '#131933',
    'brass-soft': '#3a3320',
    patina: '#6fc2ba',
    warn: '#e8b26a',
    danger: '#f08b8b',
    focus: '#9db1ff',
  },
};

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: Rgb | string, b: Rgb | string): number {
  const la = luminance(typeof a === 'string' ? hexRgb(a) : a);
  const lb = luminance(typeof b === 'string' ? hexRgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Text that must stay readable (4.5:1) on the page and on cards. */
const TEXT_PAIRS: [keyof Tokens, keyof Tokens][] = [
  ['ink', 'fog'],
  ['ink', 'surface'],
  ['slate', 'fog'],
  ['slate', 'surface'],
  ['patina', 'surface'],
  ['warn', 'surface'],
  ['danger', 'surface'],
  ['ink', 'brass-soft'],
  ['brass-ink', 'brass'],
];
export const AA_BODY = 4.5;

export const passesAA = (t: Tokens) => TEXT_PAIRS.every(([fg, bg]) => contrast(t[fg], t[bg]) >= AA_BODY);

/** Night and dusk skies are dark, so the page is too, whatever the system theme. */
export function modeFor(phase: DayPhase, systemDark: boolean): Mode {
  return systemDark || phase === 'night' || phase === 'dusk' ? 'dark' : 'light';
}

const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const toward = (base: string, sky: string, t: number) => hex(mixRgb(hexRgb(base), hexRgb(sky), t));

/** How strongly each token leans toward the sky, at full strength. */
const TINT: Record<Mode, Partial<Record<keyof Tokens, { from: 0 | 1 | 2; t: number }>>> = {
  // Light pages pick up the pale lower sky; text picks up a little of its top.
  light: {
    fog: { from: 2, t: 0.16 },
    surface: { from: 2, t: 0.05 },
    line: { from: 2, t: 0.18 },
    stave: { from: 1, t: 0.15 },
    ink: { from: 0, t: 0.12 },
    slate: { from: 1, t: 0.12 },
  },
  // Dark pages pick up the deep upper sky.
  dark: {
    fog: { from: 1, t: 0.22 },
    surface: { from: 1, t: 0.18 },
    line: { from: 1, t: 0.25 },
    stave: { from: 1, t: 0.25 },
    ink: { from: 2, t: 0.06 },
    slate: { from: 2, t: 0.1 },
  },
};

export interface PageTheme {
  mode: Mode;
  tokens: Tokens;
  /** the sky's middle colour, as --sky-tone */
  skyTone: string;
  /** how much of the full tint was used (less only where contrast needed it) */
  strength: number;
}

export function pageTheme(tone: Tone, phase: DayPhase, systemDark: boolean): PageTheme {
  const mode = modeFor(phase, systemDark);
  const base = BASE[mode];
  const build = (strength: number): Tokens => {
    const out = { ...base };
    for (const [key, tint] of Object.entries(TINT[mode]) as [keyof Tokens, { from: 0 | 1 | 2; t: number }][]) {
      out[key] = toward(base[key], tone.sky[tint.from], tint.t * strength);
    }
    return out;
  };
  // Full tint where it stays readable; otherwise ease off until every text pair passes AA.
  let strength = 1;
  let tokens = build(strength);
  while (!passesAA(tokens) && strength > 0) {
    strength = Math.max(0, Math.round((strength - 0.1) * 10) / 10);
    tokens = build(strength);
  }
  return { mode, tokens, skyTone: tone.sky[1], strength };
}

/** Put a theme on the page, or (null) go back to the CSS defaults. */
export function applyPageTheme(theme: PageTheme | null, root: HTMLElement = document.documentElement) {
  const keys = Object.keys(BASE.light) as (keyof Tokens)[];
  if (!theme) {
    for (const k of keys) root.style.removeProperty(`--${k}`);
    root.style.removeProperty('--sky-tone');
    root.style.removeProperty('color-scheme');
    delete root.dataset.skyTheme;
    return;
  }
  for (const k of keys) root.style.setProperty(`--${k}`, theme.tokens[k]);
  root.style.setProperty('--sky-tone', theme.skyTone);
  root.style.setProperty('color-scheme', theme.mode);
  root.dataset.skyTheme = theme.mode;
}
