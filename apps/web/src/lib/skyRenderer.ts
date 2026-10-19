/**
 * Draws the sky behind the header on a canvas: soft volumetric clouds, rain
 * with depth, lightning, sun, moon and stars. Clouds are painted once into
 * sprites and then only moved, so each frame is a handful of drawImage calls
 * plus the rain. The loop pauses when the tab is hidden or the sky scrolls away.
 */
import type { SkyCondition } from './weather';

export interface SkyScene {
  condition: SkyCondition;
  isDay: boolean;
}

type Rgb = [number, number, number];

interface Tone {
  /** top, middle, bottom of the sky gradient */
  sky: [string, string, string];
  /** sunlit tops and shaded undersides of clouds */
  lit: Rgb;
  shade: Rgb;
}

interface Look {
  day: Tone;
  night: Tone;
  /** drifting clouds, not counting the overcast deck */
  clouds: number;
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
}

export const SKY_LOOK: Record<SkyCondition, Look> = {
  clear: {
    day: { sky: ['#1c5fb8', '#3d86d6', '#9cc8f0'], lit: [255, 255, 255], shade: [196, 210, 232] },
    night: { sky: ['#050918', '#101a40', '#26346c'], lit: [138, 150, 190], shade: [52, 62, 102] },
    clouds: 3,
    deck: false,
    rain: 0,
    slant: 0,
    fall: 0,
    lightning: false,
    haze: 0,
  },
  cloudy: {
    day: { sky: ['#5b6780', '#7d899f', '#b2bccb'], lit: [236, 239, 245], shade: [138, 148, 168] },
    night: { sky: ['#141927', '#232a3c', '#384055'], lit: [92, 100, 124], shade: [40, 46, 64] },
    clouds: 7,
    deck: true,
    rain: 0,
    slant: 0,
    fall: 0,
    lightning: false,
    haze: 0.1,
  },
  rain: {
    day: { sky: ['#3d495f', '#56637a', '#86919f'], lit: [190, 198, 210], shade: [92, 102, 120] },
    night: { sky: ['#0e1320', '#1a2132', '#2b3346'], lit: [72, 80, 100], shade: [28, 33, 48] },
    clouds: 7,
    deck: true,
    rain: 75,
    slant: 9,
    fall: 900,
    lightning: false,
    haze: 0.18,
  },
  'heavy-rain': {
    day: { sky: ['#2b3444', '#414c5e', '#67717f'], lit: [158, 166, 180], shade: [70, 79, 96] },
    night: { sky: ['#090c14', '#131824', '#222937'], lit: [58, 65, 82], shade: [20, 24, 36] },
    clouds: 8,
    deck: true,
    rain: 190,
    slant: 15,
    fall: 1250,
    lightning: false,
    haze: 0.32,
  },
  storm: {
    day: { sky: ['#191c2b', '#292d42', '#434759'], lit: [128, 133, 152], shade: [44, 49, 66] },
    night: { sky: ['#04050b', '#0d0f1a', '#1a1d2b'], lit: [48, 52, 68], shade: [12, 14, 22] },
    clouds: 9,
    deck: true,
    rain: 160,
    slant: 20,
    fall: 1300,
    lightning: true,
    haze: 0.3,
  },
};

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
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgb;
const hexRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
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

export function createSkyRenderer(canvas: HTMLCanvasElement, initial: SkyScene, still: boolean): SkyRenderer {
  const ctx = canvas.getContext('2d');
  if (!ctx) return { setScene() {}, destroy() {} };
  const g = ctx;

  let scene = initial;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let clouds: Cloud[] = [];
  let anchor: { back: HTMLCanvasElement; front: HTMLCanvasElement; w: number; h: number } | null = null;
  let anchorPad = 0;
  let drops: Drop[] = [];
  let stars: { x: number; y: number; r: number; phase: number; speed: number }[] = [];
  let moon: HTMLCanvasElement | null = null;
  let bolt: Bolt | null = null;
  let nextStrike = rand(1.5, 4);
  let t = 0;
  let last = 0;
  let raf = 0;
  let visible = true;

  const look = () => SKY_LOOK[scene.condition];
  const tone = () => look()[scene.isDay ? 'day' : 'night'];

  /** Right edge of the content column, so the logo cloud and sun line up with the text. */
  const columnRight = () => (W + Math.min(W, MAX_WIDTH)) / 2 - GUTTER;

  function build() {
    const l = look();
    const tn = tone();
    const skyMid = hexRgb(tn.sky[1]);
    clouds = [];

    const add = (layer: 0 | 1 | 2, w: number, h: number, y: number, speed: number, alpha: number, fade: number) => {
      const { puffs, baseY } = cumulusPuffs(w, h);
      // Far clouds take on the colour of the air between.
      const t2: Tone = { ...tn, lit: mix(tn.lit, skyMid, fade), shade: mix(tn.shade, skyMid, fade) };
      clouds.push({ sprite: paintCloud(w, h, puffs, baseY, t2, dpr), x: rand(-w, W), y, w, h, speed, alpha, layer });
    };

    const scale = l.clouds <= 3 ? 0.6 : 1;
    if (l.deck) {
      const n = Math.ceil(W / 220) + 2;
      for (let i = 0; i < n; i++) add(0, rand(260, 380), rand(110, 150), rand(-70, -25), rand(4, 7), 0.95, 0.15);
      clouds.slice(-n).forEach((c, i) => (c.x = i * 220 - 120));
    }
    for (let i = 0; i < l.clouds; i++) {
      const layer = (i % 3) as 0 | 1 | 2;
      const size = [0.55, 0.8, 1.05][layer]! * scale;
      add(
        layer,
        rand(150, 240) * size,
        rand(70, 100) * size,
        rand(-10, H * (l.deck ? 0.5 : 0.35)),
        [5, 9, 14][layer]! * rand(0.8, 1.2),
        [0.7, 0.88, 1][layer]!,
        [0.4, 0.2, 0][layer]!,
      );
    }

    const aw = Math.min(W * 0.4, 180);
    const k = aw / LOGO_CLOUD.box.w;
    const back = logoPuffs(LOGO_CLOUD.back, 55, k);
    const front = logoPuffs(LOGO_CLOUD.front, 80, k);
    // The back cloud sits further off, so it takes on the colour of the sky.
    const far: Tone = { ...tn, lit: mix(tn.lit, skyMid, 0.35), shade: mix(tn.shade, skyMid, 0.35) };
    anchorPad = PAD * k;
    anchor = {
      back: paintCloud(back.w, back.h, back.puffs, back.baseY, far, dpr),
      front: paintCloud(front.w, front.h, front.puffs, front.baseY, tn, dpr),
      w: front.w,
      h: front.h,
    };

    const area = (W * H) / 100_000;
    drops = Array.from({ length: Math.round(l.rain * area) }, () => ({ x: rand(-0.2 * W, 1.2 * W), y: rand(-H, H), z: rand(0.25, 1) }));

    stars = Array.from({ length: Math.round(W * H * 0.0012) }, () => ({
      x: Math.random() * W,
      y: Math.random() * H * 0.75,
      r: Math.random() < 0.08 ? rand(1.1, 1.6) : rand(0.4, 1),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.8, 2.6),
    }));

    if (!scene.isDay && scene.condition === 'clear' && !moon) moon = paintMoon(dpr);
    bolt = null;
  }

  function paintMoon(scale: number): HTMLCanvasElement {
    const R = 19;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(R * 2 * scale);
    const m = c.getContext('2d')!;
    m.scale(scale, scale);
    const body = m.createRadialGradient(R * 0.8, R * 0.8, 1, R, R, R);
    body.addColorStop(0, '#fbf8ec');
    body.addColorStop(1, '#d9d3bd');
    m.fillStyle = body;
    m.beginPath();
    m.arc(R, R, R, 0, Math.PI * 2);
    m.fill();
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
    // The dark part of a waxing crescent, with a little earthshine left in it.
    m.globalCompositeOperation = 'destination-out';
    m.fillStyle = 'rgba(0,0,0,0.9)';
    m.beginPath();
    m.arc(R - 11, R - 4, R, 0, Math.PI * 2);
    m.fill();
    return c;
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
    const x = columnRight() - Math.min(W * 0.4, 180) * 0.3;
    const y = 74;
    const glow = g.createRadialGradient(x, y, 0, x, y, 190);
    glow.addColorStop(0, 'rgba(255,246,214,0.75)');
    glow.addColorStop(0.18, 'rgba(255,236,180,0.35)');
    glow.addColorStop(1, 'rgba(255,236,180,0)');
    g.fillStyle = glow;
    g.fillRect(x - 190, y - 190, 380, 380);

    // Faint rays turning very slowly.
    g.save();
    g.translate(x, y);
    g.rotate(t * 0.02);
    g.fillStyle = 'rgba(255,248,220,0.07)';
    for (let i = 0; i < 10; i++) {
      g.rotate((Math.PI * 2) / 10);
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(-9, -220);
      g.lineTo(9, -220);
      g.fill();
    }
    g.restore();

    const disc = g.createRadialGradient(x, y, 0, x, y, 24);
    disc.addColorStop(0, '#ffffff');
    disc.addColorStop(0.7, '#fffbe9');
    disc.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = disc;
    g.beginPath();
    g.arc(x, y, 24, 0, Math.PI * 2);
    g.fill();
  }

  function drawNight() {
    for (const s of stars) {
      const a = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
      g.fillStyle = `rgba(255,255,255,${(a * (s.r > 1 ? 1 : 0.75)).toFixed(3)})`;
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      g.fill();
    }
    if (!moon) return;
    // Up and to the left of the logo cloud, clear of the tabs.
    const x = columnRight() - Math.min(W * 0.4, 180) * 0.95;
    const y = 104;
    const glow = g.createRadialGradient(x, y, 0, x, y, 110);
    glow.addColorStop(0, 'rgba(220,226,255,0.28)');
    glow.addColorStop(1, 'rgba(220,226,255,0)');
    g.fillStyle = glow;
    g.fillRect(x - 110, y - 110, 220, 220);
    g.drawImage(moon, x - 19, y - 19, 38, 38);
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
    const l = look();
    const lean = Math.tan((l.slant * Math.PI) / 180);
    const lit = scene.isDay ? [210, 222, 240] : [150, 165, 195];
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
    const l = look();
    const tn = tone();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, tn.sky[0]);
    bg.addColorStop(0.55, tn.sky[1]);
    bg.addColorStop(1, tn.sky[2]);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    if (scene.condition === 'clear') (scene.isDay ? drawSun : drawNight)();

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
      g.drawImage(anchor.back, x, y + Math.sin(t * 0.7) * 1.5, anchor.w, anchor.h);
      g.drawImage(anchor.front, x, y + Math.sin(t * 0.9) * 3, anchor.w, anchor.h);
    }

    drawClouds(2, dt);
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
      if (next.condition === scene.condition && next.isDay === scene.isDay) return;
      scene = next;
      moon = null;
      nextStrike = rand(0.8, 2);
      build();
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
