import type { CSSProperties } from 'react';
import type { SkyCondition } from '../lib/weather';
import { CloudShape } from './Logo';

type Vars = CSSProperties & Record<`--${string}`, string | number>;

interface Look {
  /** top, middle, bottom of the gradient */
  day: [string, string, string];
  night: [string, string, string];
  clouds: number;
  cloud: { day: string; night: string };
  /** the logo cloud, there in every weather */
  anchor: { day: string; night: string };
  drops: number;
  /** degrees the rain leans */
  slant: number;
  /** seconds for the quickest drop to cross the sky */
  fall: number;
}

export const SKY_LOOK: Record<SkyCondition, Look> = {
  clear: {
    day: ['#1b5bb0', '#3a80d2', '#86b9ec'],
    night: ['#060a1c', '#121a42', '#27326c'],
    clouds: 3,
    cloud: { day: 'rgb(255 255 255 / 0.8)', night: 'rgb(120 132 180 / 0.3)' },
    anchor: { day: '#ffffff', night: '#c9d0ea' },
    drops: 0,
    slant: 0,
    fall: 0,
  },
  cloudy: {
    day: ['#4f5b72', '#6f7b91', '#a3adbd'],
    night: ['#151a28', '#252c3e', '#3a4256'],
    clouds: 7,
    cloud: { day: 'rgb(222 227 236 / 0.7)', night: 'rgb(90 99 122 / 0.6)' },
    anchor: { day: '#e9edf3', night: '#8b93aa' },
    drops: 0,
    slant: 0,
    fall: 0,
  },
  rain: {
    day: ['#36425a', '#4f5c74', '#7b879a'],
    night: ['#0f1422', '#1b2234', '#2c3447'],
    clouds: 7,
    cloud: { day: 'rgb(170 180 196 / 0.75)', night: 'rgb(70 79 100 / 0.7)' },
    anchor: { day: '#c8cfdb', night: '#6f7891' },
    drops: 70,
    slant: 10,
    fall: 0.8,
  },
  'heavy-rain': {
    day: ['#262f40', '#3a4558', '#5a6577'],
    night: ['#0a0d16', '#141927', '#222a3a'],
    clouds: 8,
    cloud: { day: 'rgb(130 140 158 / 0.8)', night: 'rgb(55 62 82 / 0.8)' },
    anchor: { day: '#9aa3b4', night: '#59627a' },
    drops: 150,
    slant: 16,
    fall: 0.52,
  },
  storm: {
    day: ['#181b2b', '#272b42', '#3f4359'],
    night: ['#05060d', '#0f111d', '#1b1e2e'],
    clouds: 9,
    cloud: { day: 'rgb(96 101 122 / 0.85)', night: 'rgb(45 49 68 / 0.85)' },
    anchor: { day: '#6c7189', night: '#40455c' },
    drops: 130,
    slant: 20,
    fall: 0.48,
  },
};

/** Small seeded generator, so the sky looks the same on every render. */
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r = seeded(19);
const between = (a: number, b: number) => a + (b - a) * r();

const CLOUDS = Array.from({ length: 9 }, (_, i) => {
  const duration = between(80, 160);
  return {
    top: between(-4, 58),
    width: between(90, 210) * (i % 3 === 0 ? 1.25 : 1),
    duration,
    delay: -between(0, duration),
    rest: between(-10, 90),
    depth: between(0.55, 1),
  };
});

const DROPS = Array.from({ length: 150 }, () => ({
  left: between(-15, 115),
  length: between(10, 24),
  width: r() < 0.25 ? 2 : r() < 0.6 ? 1.5 : 1,
  speed: between(0.85, 1.35),
  delay: -between(0, 2),
  opacity: between(0.3, 0.85),
  rest: between(0, 300),
}));

const STARS = Array.from({ length: 40 }, () => ({
  left: between(0, 100),
  top: between(2, 62),
  size: between(1, 2.6),
  delay: -between(0, 5),
  duration: between(2.5, 5.5),
}));

function Sun() {
  return (
    <div className="sun">
      <div className="sun-glow" />
      <svg viewBox="-60 -60 120 120">
        <g className="sun-rays" stroke="#ffe39a" strokeWidth="4" strokeLinecap="round">
          {Array.from({ length: 12 }, (_, i) => (
            <line key={i} x1="0" y1="-36" x2="0" y2="-50" transform={`rotate(${i * 30})`} />
          ))}
        </g>
        <circle r="27" fill="#ffd970" />
        <circle r="21" fill="#fff1c2" />
      </svg>
    </div>
  );
}

function Night() {
  return (
    <>
      {STARS.map((s, i) => (
        <span
          key={i}
          className="star"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s` }}
        />
      ))}
      <div className="moon" />
    </>
  );
}

/** Decorative: the weather in words sits next to it in the header. */
export function Sky({ condition, isDay }: { condition: SkyCondition; isDay: boolean }) {
  const look = SKY_LOOK[condition];
  const time = isDay ? 'day' : 'night';
  const [a, b, c] = look[time];
  const style: Vars = { '--sky-a': a, '--sky-b': b, '--sky-c': c, '--slant': `${look.slant}deg` };

  return (
    <div className="sky" data-condition={condition} data-time={time} style={style} aria-hidden="true">
      {condition === 'clear' && (isDay ? <Sun /> : <Night />)}

      {CLOUDS.slice(0, look.clouds).map((cl, i) => (
        <CloudShape
          key={i}
          className="sky-cloud"
          style={
            {
              top: `${cl.top}%`,
              width: condition === 'clear' ? cl.width * 0.6 : cl.width,
              color: look.cloud[time],
              opacity: cl.depth,
              animationDuration: `${cl.duration}s`,
              animationDelay: `${cl.delay}s`,
              '--rest': `${cl.rest}vw`,
            } as Vars
          }
        />
      ))}

      <div className="sky-stage">
        <div className="anchor" style={{ color: look.anchor[time] }}>
          <CloudShape />
        </div>
        {condition === 'storm' && (
          <svg className="bolt" viewBox="0 0 40 90">
            <path d="M24 0 L6 48 H20 L12 90 L36 34 H22 L32 0 Z" fill="#fff6c9" />
          </svg>
        )}
      </div>

      {look.drops > 0 && (
        <div className="rain">
          {DROPS.slice(0, look.drops).map((d, i) => (
            <span
              key={i}
              className="drop"
              style={
                {
                  left: `${d.left}%`,
                  width: d.width,
                  height: d.length,
                  opacity: d.opacity,
                  animationDuration: `${(look.fall * d.speed).toFixed(2)}s`,
                  animationDelay: `${d.delay}s`,
                  '--rest': `${d.rest}px`,
                } as Vars
              }
            />
          ))}
        </div>
      )}

      {condition === 'storm' && <div className="flash" />}
    </div>
  );
}
