import { useEffect, useRef, type CSSProperties } from 'react';
import { createSkyRenderer, SKY_LOOK, type SkyRenderer } from '../lib/skyRenderer';
import type { SkyCondition } from '../lib/weather';

type Vars = CSSProperties & Record<`--${string}`, string>;

const prefersStill = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Decorative: the weather in words sits next to it in the header. */
export function Sky({ condition, isDay }: { condition: SkyCondition; isDay: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<SkyRenderer | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    renderer.current = createSkyRenderer(canvas.current, { condition, isDay }, prefersStill());
    return () => renderer.current?.destroy();
    // The renderer is created once; scene changes go through setScene below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => renderer.current?.setScene({ condition, isDay }), [condition, isDay]);

  // The CSS gradient shows until the first frame is drawn, and if canvas is unavailable.
  const [a, b, c] = SKY_LOOK[condition][isDay ? 'day' : 'night'].sky;
  const style: Vars = { '--sky-a': a, '--sky-b': b, '--sky-c': c };
  return (
    <div className="sky" style={style} aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
