"""Segue wordmark: the S is a road (narrow far away, wide up close), then 'egue' in Bricolage Grotesque, a cloud over the S."""
import sys, math
import os; sys.path[:0] = [sys.argv[1], os.path.dirname(os.path.abspath(__file__))]  # fontTools, persp
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import persp
from place import on_road
from persp import Road, total_length

FONT, WGHT = sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 750
font = instantiateVariableFont(TTFont(FONT), {'wght': WGHT, 'opsz': 96, 'wdth': 100})
gs, cmap = font.getGlyphSet(), font.getBestCmap()
upm = font['head'].unitsPerEm
cap = font['OS/2'].sCapHeight
def glyph(ch): return cmap[ord(ch)]
def bounds(ch):
    bp = BoundsPen(gs); gs[glyph(ch)].draw(bp); return bp.bounds

# Size the road-S like the font's own S.
sx0, sy0, sx1, sy1 = bounds('S')
SW, SH = sx1 - sx0, sy1 - sy0          # font units; y up
over = (SH - cap) / 2                   # round letters overshoot cap height and baseline

# Centreline in a 0..1 box (v down), from the far end (top terminal) to the near end (bottom terminal).
N = [((0.86,0.20),(0.80,0.04),(0.62,0.0),(0.48,0.0)),
     ((0.48,0.0),(0.26,0.0),(0.12,0.10),(0.12,0.25)),
     ((0.12,0.25),(0.12,0.42),(0.30,0.46),(0.50,0.52)),
     ((0.50,0.52),(0.74,0.59),(0.90,0.64),(0.90,0.78)),
     ((0.90,0.78),(0.90,0.94),(0.72,1.0),(0.50,1.0)),
     ((0.50,1.0),(0.30,1.0),(0.14,0.94),(0.08,0.80))]
# Work in a y-down space with the baseline at y=0 and cap top at y=-cap; inset so the stroke stays inside the S bounds.
STEM_FAR, STEM_NEAR = 0.085 * SH, 0.31 * SH
inset = STEM_NEAR * 0.35
def pt(u, v): return (sx0 + inset + u * (SW - 2 * inset), -(sy1 - inset) + v * (SH - 2 * inset))
segs = [tuple(pt(u, v) for u, v in seg) for seg in N]
_s = persp.sample; persp.sample = lambda s, n=90: _s(s, n)
road = Road(segs, STEM_FAR, STEM_NEAR, 1.25); road.total = total_length(segs)
persp.sample = _s
ROAD = road.band(); DASH = road.dashes(start=0.12, dash=0.55, gap=0.75, thick=0.07)
EDGES = road.band(lo=0.40, hi=0.46) + ' ' + road.band(lo=-0.46, hi=-0.40)

# 'egue', set after the S with the font's own advances (y flipped to y-down).
hmtx = font['hmtx']
x = sx1 + 0.06 * upm                    # a little air after the road-S
letters = []
for ch in 'egue':
    pen = SVGPathPen(gs)
    gs[glyph(ch)].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
    letters.append(pen.getCommands())
    x += hmtx[glyph(ch)][0]
width = x

# The rider, on the flattest stretch of the S (its bottom curve), heading for the cloud.
BIKE_AT, BIKE_SIZE = (float(v) for v in os.environ.get('BIKE', '0.86,1.0').split(','))
BIKE = on_road(road, BIKE_AT, BIKE_SIZE)[0] if BIKE_SIZE > 0 else ''

# The logo's two clouds (512 grid), scaled so the cloud sits over the S's top terminal.
BACK = [(208,150,58),(272,104,56),(320,150,46)], (150,150,214,64,32)
FRONT = [(172,224,34),(222,196,50),(286,168,62),(346,206,44),(396,226,26)], (138,218,280,44,22)
k = (SW * 0.78) / 284                   # cloud a bit narrower than the S, so the S's top curve stays visible
tx, ty = segs[0][0]                     # far end of the road
ox, oy = tx - 250 * k, ty - 250 * k     # only the road's far end disappears under the front cloud
def cloud_shapes(layer):
    circles, (rx, ry, rw, rh, rr) = layer
    s = ''.join(f'<circle cx="{ox+cx*k:.0f}" cy="{oy+cy*k:.0f}" r="{r*k:.0f}"/>' for cx, cy, r in circles)
    return s + f'<rect x="{ox+rx*k:.0f}" y="{oy+ry*k:.0f}" width="{rw*k:.0f}" height="{rh*k:.0f}" rx="{rr*k:.0f}"/>'
top = oy + 44 * k                       # top of the back cloud
cloud_bottom = oy + 262 * k

def svg(text_color, dash_color, title='Segue'):
    pad = 0.04 * upm
    left = min(sx0, ox + 132 * k) - pad
    right = max(width, ox + 428 * k) + pad
    # Down to the lowest point of any letter: the g's tail, not just the S's curve.
    bottom = -min(bounds(ch)[1] for ch in 'Segue') + pad
    vb = (left, top - pad, right - left, bottom - (top - pad))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb[0]:.0f} {vb[1]:.0f} {vb[2]:.0f} {vb[3]:.0f}" role="img" aria-label="{title}">
  <title>{title}</title>
  <!-- Generated. The S is a road: narrow where it disappears under the cloud, wide where it reaches you. -->
  <defs>
    <linearGradient id="wm-road" x1="0" y1="{-cap:.0f}" x2="0" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#b8892f"/><stop offset="1" stop-color="#ffd36e"/></linearGradient>
    <linearGradient id="wm-front" x1="0" y1="{oy+120*k:.0f}" x2="0" y2="{cloud_bottom:.0f}" gradientUnits="userSpaceOnUse"><stop offset=".35" stop-color="#fff"/><stop offset="1" stop-color="#dfe5f5"/></linearGradient>
    <linearGradient id="wm-back" x1="0" y1="{top:.0f}" x2="0" y2="{oy+240*k:.0f}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c4cdf2"/><stop offset="1" stop-color="#8e9bd6"/></linearGradient>
  </defs>
  <path fill="url(#wm-road)" d="{ROAD}"/>
  <path fill="#fff3d0" opacity=".5" d="{EDGES}"/>
  <path fill="{dash_color}" d="{DASH}"/>
  {BIKE}
  <g fill="url(#wm-back)">{cloud_shapes(BACK)}</g>
  <g fill="url(#wm-front)">{cloud_shapes(FRONT)}</g>
  <path fill="{text_color}" d="{' '.join(letters)}"/>
</svg>
'''
out = sys.argv[4]
open(f'{out}/wordmark-light.svg', 'w').write(svg('#ffffff', '#1B2240'))   # for skies and dark backgrounds
open(f'{out}/wordmark.svg', 'w').write(svg('#1B2240', '#1B2240'))         # for light backgrounds
print('cap', cap, 'S', SW, SH, 'width', round(width))
