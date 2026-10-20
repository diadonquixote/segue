import { useEffect, useRef, type CSSProperties } from 'react';
import { createSkyRenderer, toneAt, type SkyRenderer, type SkyScene } from '../lib/skyRenderer';
import { moonState } from '../lib/sunTimes';
import type { SkyView } from '../lib/weather';

type Vars = CSSProperties & Record<`--${string}`, string>;

const prefersStill = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The renderer's scene for a sky view. Without a sun (e.g. on the landing page), a mid-afternoon sky. */
export function sceneFor(sky: Pick<SkyView, 'condition' | 'sun' | 'moon' | 'moonPath' | 'southern'>): SkyScene {
  const moon = sky.moon ?? moonState(Date.now());
  return {
    condition: sky.condition,
    elevation: sky.sun?.elevation ?? 45,
    morning: sky.sun?.morning ?? false,
    sunProgress: sky.sun ? sky.sun.progress : 0.62,
    moon: { cycle: moon.cycle, illumination: moon.illumination, waxing: moon.waxing, progress: sky.moonPath ?? -1 },
    southern: !!sky.southern,
  };
}

/** Decorative: the weather in words sits next to it in the header. */
export function Sky({ scene }: { scene: SkyScene }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<SkyRenderer | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    renderer.current = createSkyRenderer(canvas.current, scene, prefersStill());
    return () => renderer.current?.destroy();
    // The renderer is created once; scene changes go through setScene below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => renderer.current?.setScene(scene), [scene]);

  // The CSS gradient shows until the first frame is drawn, and if canvas is unavailable.
  const [a, b, c] = toneAt(scene.condition, scene.elevation, scene.morning).sky;
  const style: Vars = { '--sky-a': a, '--sky-b': b, '--sky-c': c };
  return (
    <div className="sky" style={style} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
