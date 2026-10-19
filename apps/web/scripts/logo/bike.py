"""A cute motorcycle with one rider, side view, facing right. Origin: on the ground, between the wheels."""
NAVY, CORAL, CORAL_DARK, TEAL, GOLD, SILVER = '#1B2240', '#111114', '#4a4a56', '#141418', '#ffd36e', '#c9d1e8'  # CORAL = bike body (black), TEAL = shirt (black)
RIM = '#6a7196'  # thin edge so the black shirt and bike stay readable on the dark sky

def bike(uid='b'):
    return f'''<g stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="0" cy="1" rx="42" ry="5" fill="#000" opacity=".28"/>
  <g stroke="#fff" stroke-opacity=".7" stroke-width="3"><path d="M-62 -30h-14"/><path d="M-60 -44h-20"/><path d="M-56 -58h-12"/></g>
  <rect x="-44" y="-24" width="24" height="6" rx="3" fill="{SILVER}"/>
  <path d="M-30 -14 L-4 -22" stroke="{NAVY}" stroke-width="6" fill="none"/>
  <path d="M30 -14 L20 -44" stroke="{SILVER}" stroke-width="6" fill="none"/>
  <circle cx="-30" cy="-14" r="14" fill="{NAVY}"/><circle cx="-30" cy="-14" r="6" fill="{SILVER}"/>
  <circle cx="30" cy="-14" r="14" fill="{NAVY}"/><circle cx="30" cy="-14" r="6" fill="{SILVER}"/>
  <path d="M-46 -28 Q-46 -38 -34 -38 L-6 -38 Q2 -50 16 -47 L26 -42 Q32 -34 24 -28 Z" fill="{CORAL}" stroke="{RIM}" stroke-width="2.5"/>
  <path d="M-44 -30 L22 -30" stroke="{CORAL_DARK}" stroke-width="3" fill="none"/>
  <rect x="-34" y="-44" width="26" height="7" rx="3.5" fill="{NAVY}"/>
  <circle cx="30" cy="-38" r="5.5" fill="#ffe9a3" stroke="{NAVY}" stroke-width="2"/>
  <path d="M16 -46 L12 -56" stroke="{NAVY}" stroke-width="4" fill="none"/>
  <path d="M-18 -44 L0 -36 L-2 -24" stroke="#34406e" stroke-width="9" fill="none"/>
  <path d="M-2 -24 h6" stroke="{NAVY}" stroke-width="6" fill="none"/>
  <path d="M-20 -46 L-10 -66" stroke="{RIM}" stroke-width="21" fill="none"/>
  <path d="M-8 -62 L11 -55" stroke="{RIM}" stroke-width="11" fill="none"/>
  <path d="M-20 -46 L-10 -66" stroke="{TEAL}" stroke-width="17" fill="none"/>
  <path d="M-8 -62 L11 -55" stroke="{TEAL}" stroke-width="7" fill="none"/>
  <path d="M-16 -70 q-10 -4 -18 2 q-7 5 -15 0" stroke="{GOLD}" stroke-width="4.5" fill="none"/>
  <circle cx="-6" cy="-83" r="16" fill="#fff"/>
  <path d="M-21 -86 a16 16 0 0 1 30 -4" stroke="{GOLD}" stroke-width="4" fill="none"/>
  <rect x="-2" y="-88" width="15" height="10" rx="5" fill="{NAVY}"/>
  <circle cx="9" cy="-85" r="1.8" fill="#fff" opacity=".8"/>
</g>'''

if __name__ == '__main__':
    open('bike.html','w').write(f'''<!doctype html><body style="margin:0;padding:20px;background:#1a2556;display:flex;gap:30px;align-items:flex-end">
<svg viewBox="-90 -110 140 120" width="420">{bike()}</svg><svg viewBox="-90 -110 140 120" width="100">{bike()}</svg><svg viewBox="-90 -110 140 120" width="40">{bike()}</svg>''')
