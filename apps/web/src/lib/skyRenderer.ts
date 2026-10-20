/**
 * Draws the sky behind the header on a canvas: soft volumetric clouds, rain
 * with depth, lightning, fog banks, and a sun and moon that move along their
 * real arcs. Colours follow the sun's height through night, dawn, golden
 * hour, day and dusk, blending smoothly between them. Clouds are painted once
 * into sprites and only re-tinted as the light changes, so each frame is a
 * handful of drawImage calls plus the rain. The loop pauses when the tab is
 * hidden or the sky scrolls away.
 */
import type { DayPhase } from './sunTimes';
import type { SkyCondition } from './weather';

export interface SkyScene {
  condition: SkyCondition;
  /** the sun's height, in degrees */
  elevation: number;
  /** before solar noon: tells dawn from dusk */
  morning: boolean;
  /** 0 at sunrise → 1 at sunset; null in polar day or night */
  sunProgress: number | null;
  moon: {
    /** 0 new → 0.5 full → 1 new */
    cycle: number;
    illumination: number;
    waxing: boolean;
    /** 0 rising → 1 setting; outside 0..1 below the horizon */
    progress: number;
  };
  /** south of the equator the sun crosses right to left and the moon is lit the other way */
  southern: boolean;
}

export type Rgb = [number, number, number];

export interface Tone {
  /** top, middle, bottom of the sky gradient */
  sky: [string, string, string];
  /** sunlit tops and shaded undersides of clouds */
  lit: Rgb;
  shade: Rgb;
}

interface Look extends Record<DayPhase, Tone> {
  /** drifting clouds, not counting the overcast deck */
  clouds: number;
  /** size of those clouds */
  cloudScale: number;
  /** a ceiling of cloud across the top */
  deck: boolean;
  /** rain drops per 100 000 px² of sky */
  rain: number;
  /** degrees the rain leans */
  slant: number;
  /** px per second for the nearest drops */
  fall: number;
  lightning: boolean;
  /** 0..1 grey haze over the lower sky */
  haze: number;
  /** 0..1 how clearly the sun and moon show through */
  sun: number;
  /** 0..1 how many stars show at night */
  stars: number;
  /** 0..1 drifting fog banks */
  fog: number;
}

const toHex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export const hexRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
export const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgb;
const mixHex = (a: string, b: string, t: number) => toHex(mixRgb(hexRgb(a), hexRgb(b), t));
export const mixTone = (a: Tone, b: Tone, t: number): Tone => ({
  sky: [mixHex(a.sky[0], b.sky[0], t), mixHex(a.sky[1], b.sky[1], t), mixHex(a.sky[2], b.sky[2], t)],
  lit: mixRgb(a.lit, b.lit, t),
  shade: mixRgb(a.shade, b.shade, t),
});

/** A clear sky through the day. */
const CLEAR: Record<DayPhase, Tone> = {
  night: { sky: ['#050918', '#101a40', '#26346c'], lit: [138, 150, 190], shade: [52, 62, 102] },
  dawn: { sky: ['#1f2758', '#6b5a92', '#e9a38a'], lit: [255, 205, 190], shade: [118, 100, 150] },
  'golden-hour': { sky: ['#2b5ea6', '#8a97c0', '#ffc98a'], lit: [255, 214, 160], shade: [196, 150, 130] },
  day: { sky: ['#1c5fb8', '#3d86d6', '#9cc8f0'], lit: [255, 255, 255], shade: [196, 210, 232] },
  dusk: { sky: ['#141842', '#4b3a78', '#d7707f'], lit: [235, 160, 170], shade: [86, 66, 118] },
};

/** Day and night for each kind of weather; twilight is derived below. */
const CLOUDY_DAY: Tone = { sky: ['#5b6780', '#7d899f', '#b2bccb'], lit: [236, 239, 245], shade: [138, 148, 168] };
const CLOUDY_NIGHT: Tone = { sky: ['#141927', '#232a3c', '#384055'], lit: [92, 100, 124], shade: [40, 46, 64] };
const DAY_NIGHT: Record<SkyCondition, { day: Tone; night: Tone }> = {
  clear: { day: CLEAR.day, night: CLEAR.night },
  'partly-cloudy': { day: mixTone(CLEAR.day, CLOUDY_DAY, 0.22), night: mixTone(CLEAR.night, CLOUDY_NIGHT, 0.3) },
  cloudy: { day: CLOUDY_DAY, night: CLOUDY_NIGHT },
  fog: {
    day: { sky: ['#8f99a8', '#aeb6c2', '#cfd5dd'], lit: [238, 241, 245], shade: [176, 184, 196] },
    night: { sky: ['#151a25', '#262d3b', '#3c4454'], lit: [92, 100, 120], shade: [44, 50, 66] },
  },
  rain: {
    day: { sky: ['#3d495f', '#56637a', '#86919f'], lit: [190, 198, 210], shade: [92, 102, 120] },
    night: { sky: ['#0e1320', '#1a2132', '#2b3346'], lit: [72, 80, 100], shade: [28, 33, 48] },
  },
  'heavy-rain': {
    day: { sky: ['#2b3444', '#414c5e', '#67717f'], lit: [158, 166, 180], shade: [70, 79, 96] },
    night: { sky: ['#090c14', '#131824', '#222937'], lit: [58, 65, 82], shade: [20, 24, 36] },
  },
  storm: {
    day: { sky: ['#191c2b', '#292d42', '#434759'], lit: [128, 133, 152], shade: [44, 49, 66] },
    night: { sky: ['#04050b', '#0d0f1a', '#1a1d2b'], lit: [48, 52, 68], shade: [12, 14, 22] },
  },
};

/** How much of the clear sky's twilight colour shows through each kind of weather. */
const KEEP_COLOUR: Record<SkyCondition, number> = { clear: 1, 'partly-cloudy': 0.8, cloudy: 0.35, fog: 0.3, rain: 0.25, 'heavy-rain': 0.15, storm: 0.1 };
/** How far toward night each twilight phase is. */
const TOWARD_NIGHT = { dawn: 0.55, 'golden-hour': 0.2, dusk: 0.6 } as const;

function twilight(condition: SkyCondition, phase: 'dawn' | 'golden-hour' | 'dusk'): Tone {
  const { day, night } = DAY_NIGHT[condition];
  return mixTone(mixTone(day, night, TOWARD_NIGHT[phase]), CLEAR[phase], KEEP_COLOUR[condition]);
}

function look(condition: SkyCondition, rest: Omit<Look, DayPhase>): Look {
  const { day, night } = DAY_NIGHT[condition];
  return { day, night, dawn: twilight(condition, 'dawn'), 'golden-hour': twilight(condition, 'golden-hour'), dusk: twilight(condition, 'dusk'), ...rest };
}

const DRY = { rain: 0, slant: 0, fall: 0, lightning: false };
export const SKY_LOOK: Record<SkyCondition, Look> = {
  clear: look('clear', { ...DRY, clouds: 3, cloudScale: 0.6, deck: false, haze: 0, sun: 1, stars: 1, fog: 0 }),
  'partly-cloudy': look('partly-cloudy', { ...DRY, clouds: 6, cloudScale: 0.85, deck: false, haze: 0.04, sun: 0.9, stars: 0.6, fog: 0 }),
  cloudy: look('cloudy', { ...DRY, clouds: 7, cloudScale: 1, deck: true, haze: 0.1, sun: 0.2, stars: 0, fog: 0 }),
  fog: look('fog', { ...DRY, clouds: 2, cloudScale: 1, deck: false, haze: 0.45, sun: 0.3, stars: 0, fog: 0.8 }),
  rain: look('rain', { clouds: 7, cloudScale: 1, deck: true, rain: 75, slant: 9, fall: 900, lightning: false, haze: 0.18, sun: 0.05, stars: 0, fog: 0 }),
  'heavy-rain': look('heavy-rain', { clouds: 8, cloudScale: 1, deck: true, rain: 190, slant: 15, fall: 1250, lightning: false, haze: 0.32, sun: 0, stars: 0, fog: 0 }),
  storm: look('storm', { clouds: 9, cloudScale: 1, deck: true, rain: 160, slant: 20, fall: 1300, lightning: true, haze: 0.3, sun: 0, stars: 0, fog: 0 }),
};

/** Sun heights where each tone is at its fullest; colours blend in between. */
const MORNING: [number, DayPhase][] = [
  [-12, 'night'],
  [-4, 'dawn'],
  [3, 'golden-hour'],
  [10, 'day'],
];
const EVENING: [number, DayPhase][] = [
  [-12, 'night'],
  [-4, 'dusk'],
  [3, 'golden-hour'],
  [10, 'day'],
];

/** The sky's colours for a kind of weather at a sun height, blended smoothly between phases. */
export function toneAt(condition: SkyCondition, elevation: number, morning: boolean): Tone {
  const l = SKY_LOOK[condition];
  const anchors = morning ? MORNING : EVENING;
  if (elevation <= anchors[0]![0]) return l[anchors[0]![1]];
  for (let i = 1; i < anchors.length; i++) {
    const [e1, p1] = anchors[i]!;
    const [e0, p0] = anchors[i - 1]!;
    if (elevation <= e1) return mixTone(l[p0], l[p1], (elevation - e0) / (e1 - e0));
  }
  return l.day;
}

/** Same layout as public/icon.svg (512 grid): the logo's two clouds, rendered for real. */
interface CloudLayer {
  circles: [number, number, number][];
  base: { x: number; y: number; w: number; h: number };
}
const LOGO_CLOUD: { back: CloudLayer; front: CloudLayer; box: { x: number; y: number; w: number; h: number } } = {
  back: {
    circles: [
      [208, 150, 58],
      [272, 104, 56],
      [320, 150, 46],
    ],
    base: { x: 150, y: 150, w: 214, h: 64 },
  },
  front: {
    circles: [
      [172, 224, 34],
      [222, 196, 50],
      [286, 168, 62],
      [346, 206, 44],
      [396, 226, 26],
    ],
    base: { x: 138, y: 218, w: 280, h: 44 },
  },
  box: { x: 132, y: 44, w: 296, h: 222 },
};

const MAX_WIDTH = 560; // matches --max
const GUTTER = 20;

const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r},${g},${b},${a})`;
const mix = mixRgb;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const rand = (a: number, b: number) => a + (b - a) * Math.random();

interface Puff {
  x: number;
  y: number;
  r: number;
}

/** Paints puffs as one lit cloud: shaded body, sunlit tops, soft flat base, darker belly. */
function paintCloud(w: number, h: number, puffs: Puff[], baseY: number, tone: Tone, dpr: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * dpr));
  c.height = Math.max(1, Math.ceil(h * dpr));
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);

  for (const p of puffs) {
    const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
    grad.addColorStop(0, rgba(tone.shade, 0.95));
    grad.addColorStop(0.55, rgba(tone.shade, 0.75));
    grad.addColorStop(1, rgba(tone.shade, 0));
    g.fillStyle = grad;
    g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  for (const p of puffs) {
    const x = p.x;
    const y = p.y - p.r * 0.3;
    const r = p.r * 0.85;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(tone.lit, 0.9));
    grad.addColorStop(0.5, rgba(tone.lit, 0.45));
    grad.addColorStop(1, rgba(tone.lit, 0));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Undersides sit in their own shadow.
  g.globalCompositeOperation = 'source-atop';
  const belly = g.createLinearGradient(0, baseY - h * 0.45, 0, baseY);
  belly.addColorStop(0, rgba(tone.shade, 0));
  belly.addColorStop(1, rgba(mix(tone.shade, [0, 0, 0], 0.25), 0.55));
  g.fillStyle = belly;
  g.fillRect(0, 0, w, h);

  // Cumulus have flat-ish bases: fade out whatever hangs below.
  g.globalCompositeOperation = 'destination-in';
  const floor = g.createLinearGradient(0, baseY - 8, 0, baseY + 10);
  floor.addColorStop(0, 'rgba(0,0,0,1)');
  floor.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = floor;
  g.fillRect(0, 0, w, h);
  return c;
}

function cumulusPuffs(w: number, h: number): { puffs: Puff[]; baseY: number } {
  const baseY = h * 0.8;
  const puffs: Puff[] = [];
  const n = Math.max(10, Math.round(w / 7));
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const middle = 1 - Math.abs(u - 0.5) * 2;
    const r = h * (0.1 + 0.24 * middle * rand(0.6, 1));
    // Keep every puff inside the sprite, or its soft edge gets cut off square.
    const x = Math.min(Math.max(w * (0.1 + 0.8 * u), r), w - r);
    const y = Math.max(Math.min(baseY - r * rand(0.25, 0.4) - h * 0.42 * middle * Math.random(), baseY - r * 0.2), r);
    puffs.push({ x, y, r });
  }
  return { puffs, baseY };
}

/** Room around the logo cloud for the puffs' soft edges. */
const PAD = 46;

function logoPuffs(layer: CloudLayer, count: number, scale: number): { puffs: Puff[]; baseY: number; w: number; h: number } {
  const { circles, base } = layer;
  const { box } = LOGO_CLOUD;
  const inside = (x: number, y: number) =>
    circles.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r) ||
    (x >= base.x && x <= base.x + base.w && y >= base.y && y <= base.y + base.h);
  const puffs: Puff[] = [];
  let guard = 0;
  while (puffs.length < count && guard++ < 5000) {
    const x = rand(box.x, box.x + box.w);
    const y = rand(box.y, box.y + box.h);
    if (!inside(x, y)) continue;
    const r = rand(26, 42);
    puffs.push({ x: (x - box.x + PAD) * scale, y: (y - box.y + PAD) * scale, r: r * scale });
  }
  // Both layers share one frame, so they line up exactly as in the icon.
  return { puffs, baseY: (base.y + base.h - box.y + PAD) * scale, w: (box.w + PAD * 2) * scale, h: (box.h + PAD * 2) * scale };
}

interface Cloud {
  sprite: HTMLCanvasElement;
  /** kept so the sprite can be re-tinted as the light changes */
  puffs: Puff[];
  baseY: number;
  /** how much the colour of the air between tints it (far clouds more) */
  fade: number;
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  alpha: number;
  layer: 0 | 1 | 2;
}

interface Drop {
  x: number;
  y: number;
  z: number;
}

interface Bolt {
  paths: { pts: [number, number][]; width: number }[];
  age: number;
  /** false = sheet lightning inside the cloud, no visible bolt */
  visible: boolean;
}

/** Midpoint displacement: a jagged, slightly wandering path between two points. */
function jag(x0: number, y0: number, x1: number, y1: number, spread: number, depth: number): [number, number][] {
  if (depth === 0) return [
    [x0, y0],
    [x1, y1],
  ];
  const mx = (x0 + x1) / 2 + rand(-spread, spread);
  const my = (y0 + y1) / 2 + rand(-spread, spread) * 0.3;
  const a = jag(x0, y0, mx, my, spread / 2, depth - 1);
  return [...a.slice(0, -1), ...jag(mx, my, x1, y1, spread / 2, depth - 1)];
}

function makeBolt(w: number, h: number): Bolt {
  const x0 = rand(w * 0.15, w * 0.85);
  const y0 = h * rand(0.18, 0.3);
  const x1 = x0 + rand(-w * 0.15, w * 0.15);
  const trunk = jag(x0, y0, x1, h * 1.05, w * 0.12, 6);
  const paths = [{ pts: trunk, width: 2.4 }];
  for (let i = 0; i < 3; i++) {
    const from = trunk[Math.floor(rand(trunk.length * 0.2, trunk.length * 0.7))]!;
    const dir = Math.random() < 0.5 ? -1 : 1;
    paths.push({ pts: jag(from[0], from[1], from[0] + dir * rand(30, 90), from[1] + rand(40, 110), 22, 4), width: 1.1 });
  }
  return { paths, age: 0, visible: Math.random() < 0.65 };
}

/** Brightness of a strike over time: two or three quick flickers. */
function flicker(age: number): number {
  if (age < 0.06) return 1;
  if (age < 0.12) return 0.25;
  if (age < 0.2) return 0.85;
  if (age < 0.26) return 0.3;
  if (age < 0.5) return 0.6 * (1 - (age - 0.26) / 0.24);
  return 0;
}

export interface SkyRenderer {
  setScene(scene: SkyScene): void;
  destroy(): void;
}

/** Where a body on an arc is drawn: rises at the left (right in the south), highest halfway, sets at the other side. */
function arcPoint(progress: number, W: number, H: number, southern: boolean): { x: number; y: number } {
  const p = Math.max(-0.08, Math.min(1.08, progress));
  const across = southern ? 1 - p : p;
  return { x: W * 0.06 + across * W * 0.88, y: H * 0.95 - Math.sin(Math.PI * Math.max(0, Math.min(1, p))) * H * 0.8 };
}

/** The moon's disc lit as it really is tonight. */
function paintMoon(scale: number, cycle: number, waxing: boolean, southern: boolean): HTMLCanvasElement {
  const R = 19;
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(R * 2 * scale);
  const m = c.getContext('2d')!;
  m.scale(scale, scale);
  // The unlit part keeps a little earthshine.
  m.fillStyle = 'rgba(200,205,225,0.13)';
  m.beginPath();
  m.arc(R, R, R, 0, Math.PI * 2);
  m.fill();
  // Seen from the north a waxing moon is lit on the right; from the south, the left.
  const rightLit = waxing !== southern;
  const k = Math.cos(2 * Math.PI * cycle); // 1 new, 0 half, -1 full
  const crescent = k > 0;
  m.beginPath();
  m.arc(R, R, R, -Math.PI / 2, Math.PI / 2, !rightLit);
  m.ellipse(R, R, Math.abs(k) * R, R, 0, Math.PI / 2, -Math.PI / 2, rightLit === crescent);
  m.closePath();
  const body = m.createRadialGradient(R * 0.8, R * 0.8, 1, R, R, R);
  body.addColorStop(0, '#fbf8ec');
  body.addColorStop(1, '#d9d3bd');
  m.fillStyle = body;
  m.fill();
  m.globalCompositeOperation = 'source-atop';
  m.fillStyle = 'rgba(120,110,90,0.12)';
  for (const [x, y, r] of [
    [14, 12, 4],
    [24, 22, 5],
    [12, 26, 3],
    [26, 11, 2.5],
  ] as const) {
    m.beginPath();
    m.arc(x, y, r, 0, Math.PI * 2);
    m.fill();
  }
  return c;
}

export function createSkyRenderer(canvas: HTMLCanvasElement, initial: SkyScene, still: boolean): SkyRenderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setScene() {}, destroy() {} };
  const g = ctx;

  let scene = initial;
  let tn: Tone = toneAt(scene.condition, scene.elevation, scene.morning);
  /** the light the cloud sprites were last painted in */
  let toneKey = '';
  let W = 0;
  let H = 0;
  let dpr = 1;
  let clouds: Cloud[] = [];
  let anchor: { back: HTMLCanvasElement; front: HTMLCanvasElement; backPuffs: ReturnType<typeof logoPuffs>; frontPuffs: ReturnType<typeof logoPuffs>; w: number; h: number } | null = null;
  let anchorPad = 0;
  let drops: Drop[] = [];
  let stars: { x: number; y: number; r: number; phase: number; speed: number }[] = [];
  let moon: { sprite: HTMLCanvasElement; key: string } | null = null;
  let fogBanks: { x: number; y: number; w: number; h: number; speed: number }[] = [];
  let bolt: Bolt | null = null;
  let nextStrike = rand(1.5, 4);
  let t = 0;
  let last = 0;
  let raf = 0;
  let visible = true;

  const lookNow = () => SKY_LOOK[scene.condition];
  /** Tones stop changing beyond ±14°, so rounding the height there keeps re-tinting rare. */
  const keyFor = (sc: SkyScene) => `${sc.condition}:${Math.round(Math.max(-14, Math.min(14, sc.elevation)))}:${sc.morning}`;

  /** Right edge of the content column, so the logo cloud lines up with the text. */
  const columnRight = () => (W + Math.min(W, MAX_WIDTH)) / 2 - GUTTER;

  /** Re-paint every cloud in the current light, keeping where they are. */
  function tint() {
    const skyMid = hexRgb(tn.sky[1]);
    for (const c of clouds) {
      const t2: Tone = { ...tn, lit: mix(tn.lit, skyMid, c.fade), shade: mix(tn.shade, skyMid, c.fade) };
      c.sprite = paintCloud(c.w, c.h, c.puffs, c.baseY, t2, dpr);
    }
    if (anchor) {
      // The back cloud sits further off, so it takes on the colour of the sky.
      const far: Tone = { ...tn, lit: mix(tn.lit, skyMid, 0.35), shade: mix(tn.shade, skyMid, 0.35) };
      anchor.back = paintCloud(anchor.backPuffs.w, anchor.backPuffs.h, anchor.backPuffs.puffs, anchor.backPuffs.baseY, far, dpr);
      anchor.front = paintCloud(anchor.frontPuffs.w, anchor.frontPuffs.h, anchor.frontPuffs.puffs, anchor.frontPuffs.baseY, tn, dpr);
    }
    toneKey = keyFor(scene);
  }

  function build() {
    const l = lookNow();
    clouds = [];
    const add = (layer: 0 | 1 | 2, w: number, h: number, y: number, speed: number, alpha: number, fade: number) => {
      const { puffs, baseY } = cumulusPuffs(w, h);
      clouds.push({ sprite: document.createElement('canvas'), puffs, baseY, fade, x: rand(-w, W), y, w, h, speed, alpha, layer });
    };
    if (l.deck) {
      const n = Math.ceil(W / 220) + 2;
      for (let i = 0; i < n; i++) add(0, rand(260, 380), rand(110, 150), rand(-70, -25), rand(4, 7), 0.95, 0.15);
      clouds.slice(-n).forEach((c, i) => (c.x = i * 220 - 120));
    }
    for (let i = 0; i < l.clouds; i++) {
      const layer = (i % 3) as 0 | 1 | 2;
      const size = [0.55, 0.8, 1.05][layer]! * l.cloudScale;
      add(
        layer,
        rand(150, 240) * size,
        rand(70, 100) * size,
        rand(-10, H * (l.deck ? 0.5 : 0.35)),
        [5, 9, 14][layer]! * rand(0.8, 1.2),
        [0.7, 0.88, 1][layer]! * (l.fog ? 0.6 : 1),
        [0.4, 0.2, 0][layer]!,
      );
    }

    const aw = Math.min(W * 0.4, 180);
    const k = aw / LOGO_CLOUD.box.w;
    const backPuffs = logoPuffs(LOGO_CLOUD.back, 55, k);
    const frontPuffs = logoPuffs(LOGO_CLOUD.front, 80, k);
    anchorPad = PAD * k;
    anchor = { back: document.createElement('canvas'), front: document.createElement('canvas'), backPuffs, frontPuffs, w: frontPuffs.w, h: frontPuffs.h };

    const area = (W * H) / 100_000;
    drops = Array.from({ length: Math.round(l.rain * area) }, () => ({ x: rand(-0.2 * W, 1.2 * W), y: rand(-H, H), z: rand(0.25, 1) }));
    stars = Array.from({ length: Math.round(W * H * 0.0012) }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.75,
      r: Math.random() < 0.08 ? rand(1.1, 1.6) : rand(0.4, 1),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.8, 2.6),
    }));
    fogBanks = l.fog
      ? Array.from({ length: 4 }, (_, i) => ({ x: rand(-W * 0.3, W), y: H * (0.35 + i * 0.17), w: W * rand(0.7, 1.1), h: H * rand(0.18, 0.28), speed: rand(3, 8) }))
      : [];
    bolt = null;
    tint();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    moon = null;
    build();
    if (still) draw(0);
  }

  function drawSun() {
    const l = lookNow();
    const e = scene.elevation;
    // Fades in and out as it crosses the horizon.
    const shown = l.sun * clamp01((e + 1.5) / 3);
    if (shown <= 0.01) return;
    const progress = scene.sunProgress ?? (e > 0 ? 0.5 : -1);
    const { x, y } = arcPoint(progress, W, H, scene.southern);
    // Warmer and bigger near the horizon.
    const low = clamp01(1 - e / 14);
    const core = mix([255, 255, 255], [255, 178, 96], low);
    const glowR = 150 + 120 * low;
    const glow = g.createRadialGradient(x, y, 0, x, y, glowR);
    glow.addColorStop(0, rgba(mix([255, 246, 214], core, 0.5), 0.75 * shown));
    glow.addColorStop(0.18, rgba(mix([255, 236, 180], core, 0.6), 0.35 * shown));
    glow.addColorStop(1, rgba(core, 0));
    g.fillStyle = glow;
    g.fillRect(x - glowR, y - glowR, glowR * 2, glowR * 2);

    // Faint rays turning very slowly, only when the sun is high and clear.
    if (l.sun > 0.8 && e > 8) {
      g.save();
      g.translate(x, y);
      g.rotate(t * 0.02);
      g.fillStyle = `rgba(255,248,220,${(0.07 * shown).toFixed(3)})`;
      for (let i = 0; i < 10; i++) {
        g.rotate((Math.PI * 2) / 10);
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(-9, -220);
        g.lineTo(9, -220);
        g.fill();
      }
      g.restore();
    }

    // Through cloud or fog the disc is a soft blur; in a clear sky it's crisp.
    const r = l.sun > 0.5 ? 24 : 34;
    const disc = g.createRadialGradient(x, y, 0, x, y, r);
    disc.addColorStop(0, rgba(core, shown));
    disc.addColorStop(l.sun > 0.5 ? 0.7 : 0.2, rgba(mix(core, [255, 251, 233], 0.5), shown * (l.sun > 0.5 ? 1 : 0.6)));
    disc.addColorStop(1, rgba(core, 0));
    g.fillStyle = disc;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  function drawStars() {
    const shown = lookNow().stars * clamp01((-scene.elevation - 4) / 8);
    if (shown <= 0.01) return;
    for (const s of stars) {
      const a = (0.55 + 0.45 * Math.sin(t * s.speed + s.phase)) * shown;
      g.fillStyle = `rgba(255,255,255,${(a * (s.r > 1 ? 1 : 0.75)).toFixed(3)})`;
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      g.fill();
    }
  }

  function drawMoon() {
    const l = lookNow();
    const { cycle, illumination, waxing, progress } = scene.moon;
    if (progress <= -0.02 || progress >= 1.02 || illumination < 0.03) return;
    // Bright at night, pale in daylight, hidden by thick cloud.
    const daylight = clamp01((scene.elevation + 4) / 10);
    const shown = Math.max(l.sun, l.stars * 0.6) * (1 - 0.6 * daylight) * clamp01(Math.min(progress, 1 - progress) * 20);
    if (shown <= 0.02) return;
    const key = `${Math.round(cycle * 200)}:${scene.southern}`;
    if (!moon || moon.key !== key) moon = { sprite: paintMoon(dpr, cycle, waxing, scene.southern), key };
    const { x, y } = arcPoint(progress, W, H, scene.southern);
    if (daylight < 0.5) {
      const glow = g.createRadialGradient(x, y, 0, x, y, 110);
      glow.addColorStop(0, `rgba(220,226,255,${(0.28 * shown * illumination).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(220,226,255,0)');
      g.fillStyle = glow;
      g.fillRect(x - 110, y - 110, 220, 220);
    }
    g.globalAlpha = shown;
    g.drawImage(moon.sprite, x - 19, y - 19, 38, 38);
    g.globalAlpha = 1;
  }

  function drawFog(dt: number) {
    const l = lookNow();
    if (!l.fog) return;
    const c = hexRgb(tn.sky[2]);
    for (const b of fogBanks) {
      b.x += b.speed * dt;
      if (b.x > W + b.w * 0.5) b.x = -b.w * 1.5;
      const cx = b.x + b.w / 2;
      const grad = g.createRadialGradient(cx, b.y, 0, cx, b.y, b.w / 2);
      grad.addColorStop(0, rgba(c, 0.55 * l.fog));
      grad.addColorStop(1, rgba(c, 0));
      g.save();
      g.translate(cx, b.y);
      g.scale(1, b.h / b.w);
      g.translate(-cx, -b.y);
      g.fillStyle = grad;
      g.fillRect(b.x, b.y - b.w / 2, b.w, b.w);
      g.restore();
    }
  }

  function drawClouds(layer: 0 | 1 | 2, dt: number) {
    for (const c of clouds) {
      if (c.layer !== layer) continue;
      c.x += c.speed * dt;
      if (c.x > W + 40) c.x = -c.w - 40;
      g.globalAlpha = c.alpha;
      g.drawImage(c.sprite, c.x, c.y, c.w, c.h);
    }
    g.globalAlpha = 1;
  }

  function drawRain(dt: number, near: boolean) {
    const l = lookNow();
    const lean = Math.tan((l.slant * Math.PI) / 180);
    const lit = mix([150, 165, 195], [210, 222, 240], clamp01((scene.elevation + 6) / 12));
    // Three depth buckets keep the number of strokes low.
    for (const [lo, hi] of near ? [[0.75, 1.01]] : [
      [0, 0.5],
      [0.5, 0.75],
    ]) {
      const zMid = (lo! + hi!) / 2;
      g.strokeStyle = `rgba(${lit[0]},${lit[1]},${lit[2]},${(0.12 + 0.4 * zMid).toFixed(3)})`;
      g.lineWidth = 0.5 + 1.1 * zMid;
      g.beginPath();
      for (const d of drops) {
        if (d.z < lo! || d.z >= hi!) continue;
        const v = l.fall * (0.45 + 0.55 * d.z);
        d.y += v * dt;
        d.x += v * lean * dt;
        if (d.y > H + 30) {
          d.y = rand(-60, -10);
          d.x = rand(-0.2 * W, 1.1 * W);
        }
        const len = (8 + 22 * d.z) * (l.fall / 1000);
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - len * lean, d.y - len);
      }
      g.stroke();
    }
  }

  function drawBolt(intensity: number) {
    if (!bolt?.visible || intensity <= 0) return;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowColor = 'rgba(190,205,255,1)';
    g.shadowBlur = 22;
    for (const p of bolt.paths) {
      g.strokeStyle = `rgba(245,248,255,${intensity.toFixed(3)})`;
      g.lineWidth = p.width;
      g.beginPath();
      p.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    g.restore();
  }

  function draw(dt: number) {
    const l = lookNow();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, tn.sky[0]);
    bg.addColorStop(0.55, tn.sky[1]);
    bg.addColorStop(1, tn.sky[2]);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    drawStars();
    drawMoon();
    drawSun();

    let flash = 0;
    if (l.lightning) {
      if (!bolt) {
        nextStrike -= dt;
        if (nextStrike <= 0 || (still && dt === 0)) bolt = makeBolt(W, H);
      }
      if (bolt) {
        flash = still ? 0.7 : flicker(bolt.age);
        bolt.age += dt;
        if (!still && bolt.age > 0.6) {
          bolt = null;
          nextStrike = rand(2.5, 7.5);
        }
      }
    }

    drawClouds(0, dt);
    if (l.rain) drawRain(dt, false);
    drawBolt(flash);
    drawClouds(1, dt);

    if (anchor) {
      const x = columnRight() - anchor.w + anchorPad + 6;
      const y = 80 - anchorPad;
      // A touch of parallax: the far cloud drifts less than the near one.
      g.globalAlpha = l.fog ? 0.75 : 1;
      g.drawImage(anchor.back, x, y + Math.sin(t * 0.7) * 1.5, anchor.w, anchor.h);
      g.drawImage(anchor.front, x, y + Math.sin(t * 0.9) * 3, anchor.w, anchor.h);
      g.globalAlpha = 1;
    }

    drawClouds(2, dt);
    drawFog(dt);
    if (l.rain) drawRain(dt, true);

    if (l.haze) {
      const haze = g.createLinearGradient(0, H * 0.35, 0, H);
      const c = hexRgb(tn.sky[2]);
      haze.addColorStop(0, rgba(c, 0));
      haze.addColorStop(1, rgba(c, l.haze));
      g.fillStyle = haze;
      g.fillRect(0, 0, W, H);
    }

    if (flash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(150,160,200,${(0.35 * flash).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
  }

  function frame(now: number) {
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    t += dt;
    draw(dt);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (still || raf || !visible || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  const onVisibility = () => (document.hidden ? stop() : start());
  const ro = new ResizeObserver(() => resize());
  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    if (visible) start();
    else stop();
  });
  ro.observe(canvas);
  io.observe(canvas);
  document.addEventListener('visibilitychange', onVisibility);
  resize();
  start();

  return {
    setScene(next) {
      const conditionChanged = next.condition !== scene.condition;
      scene = next;
      tn = toneAt(scene.condition, scene.elevation, scene.morning);
      if (conditionChanged) {
        nextStrike = rand(0.8, 2);
        build();
      } else if (keyFor(scene) !== toneKey) {
        tint();
      }
      if (still) draw(0);
    },
    destroy() {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
