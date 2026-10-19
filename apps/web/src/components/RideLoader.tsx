/** The logo's rider on the road while a plan is being built. */
export function RideLoader({ label = 'Finding the best route through your day…' }: { label?: string }) {
  return (
    <div className="ride" role="status" aria-live="polite">
      <div className="ride-road" aria-hidden="true">
        <svg className="ride-bike" viewBox="-60 -100 110 108" width="64" height="62">
          <ellipse cx="0" cy="1" rx="36" ry="4" fill="#000" opacity=".2" />
          <g stroke="#9aa3bd" strokeWidth="3" strokeLinecap="round">
            <path d="M-50 -30h-10" />
            <path d="M-48 -44h-14" />
          </g>
          <path d="M-30 -14 L-4 -22" stroke="#1B2240" strokeWidth="6" fill="none" />
          <path d="M30 -14 L20 -44" stroke="#c9d1e8" strokeWidth="6" fill="none" strokeLinecap="round" />
          <g className="ride-wheel">
            <circle cx="-30" cy="-14" r="14" fill="#1B2240" />
            <circle cx="-30" cy="-14" r="6" fill="#c9d1e8" />
          </g>
          <g className="ride-wheel">
            <circle cx="30" cy="-14" r="14" fill="#1B2240" />
            <circle cx="30" cy="-14" r="6" fill="#c9d1e8" />
          </g>
          <path d="M-46 -28 Q-46 -38 -34 -38 L-6 -38 Q2 -50 16 -47 L26 -42 Q32 -34 24 -28 Z" fill="#111114" stroke="#6a7196" strokeWidth="2.5" />
          <circle cx="30" cy="-38" r="5.5" fill="#ffe9a3" stroke="#1B2240" strokeWidth="2" />
          <path d="M-18 -44 L0 -36 L-2 -24" stroke="#34406e" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M-20 -46 L-10 -66" stroke="#6a7196" strokeWidth="21" strokeLinecap="round" />
          <path d="M-20 -46 L-10 -66" stroke="#141418" strokeWidth="17" strokeLinecap="round" />
          <path d="M-8 -62 L11 -55" stroke="#141418" strokeWidth="7" strokeLinecap="round" />
          <path className="ride-scarf" d="M-16 -70 q-10 -4 -18 2 q-7 5 -15 0" stroke="#ffd36e" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <circle cx="-6" cy="-83" r="16" fill="#fff" />
          <path d="M-21 -86 a16 16 0 0 1 30 -4" stroke="#ffd36e" strokeWidth="4" fill="none" strokeLinecap="round" />
          <rect x="-2" y="-88" width="15" height="10" rx="5" fill="#1B2240" />
        </svg>
      </div>
      <p className="muted small">{label}</p>
    </div>
  );
}
