import type { CSSProperties } from 'react';

/**
 * The Segue mark: a cloud that stays whatever the weather, resting on a road
 * that bends away from the straight line, the other road you take when the
 * day changes. The same cloud floats in the sky behind the app.
 * Geometry is on the 512 grid of public/icon.svg; keep them in sync.
 */
function CloudParts() {
  return (
    <>
      <circle cx="178" cy="236" r="58" />
      <circle cx="262" cy="190" r="88" />
      <circle cx="350" cy="230" r="62" />
      <rect x="120" y="230" width="292" height="64" rx="32" />
    </>
  );
}

/** Just the cloud, filled with currentColor. */
export function CloudShape({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="116 98 300 200" aria-hidden="true" focusable="false">
      <g fill="currentColor">
        <CloudParts />
      </g>
    </svg>
  );
}

const ROAD = 'M128 300 H290 C372 300 394 352 350 386 C300 424 214 420 176 458 C158 476 156 494 164 506';

/** Cloud and road, no tile, for use on top of the sky. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg className="logo-mark" viewBox="98 96 316 436" height={size} width={(size * 316) / 436} aria-hidden="true" focusable="false">
      <g fill="#F2F4F8">
        <CloudParts />
      </g>
      <path d={ROAD} fill="none" stroke="#E0B04F" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
      <path d={ROAD} fill="none" stroke="#1B2240" strokeWidth="6" strokeDasharray="18 22" strokeDashoffset="-8" strokeLinecap="round" />
    </svg>
  );
}
