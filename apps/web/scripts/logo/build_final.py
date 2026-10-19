"""Writes apps/web/public/icon.svg (and square/maskable variants for the PNGs)."""
import sys, persp
_s = persp.sample
persp.sample = lambda segs, n=120: _s(segs, n)
import sroad
from sroad import shapes
from place import on_road

# One rider on the flat middle of the S, heading for the cloud.
BIKE = on_road(sroad.R, 0.45, 2.4)[0]

BACK = shapes([(208,150,58),(272,104,56),(320,150,46)], [(150,150,214,64,32)])
FRONT = shapes([(172,224,34),(222,196,50),(286,168,62),(346,206,44),(396,226,26)], [(138,218,280,44,22)])

def icon(tile=True, scale=1.0):
    clip = '\n    <clipPath id="tile"><rect width="512" height="512" rx="112"/></clipPath>' if tile else ''
    open_g = '<g clip-path="url(#tile)">' if tile else '<g>'
    art = f'<g transform="translate(256 256) scale({scale}) translate(-256 -256)">' if scale != 1 else '<g>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Segue: a cloud that stays whatever the weather, and a road that winds out from under it in an S.
       Narrow in the distance, wide up close, with one rider heading for the cloud. Generated; the sky's logo cloud (lib/skyRenderer.ts) uses the same circles. -->
  <defs>{clip}
    {sroad.DEFS.replace(chr(10), chr(10) + '    ')}
  </defs>
  {open_g}
    <rect width="512" height="512" fill="url(#bg)"/>
    {art}
      <path fill="url(#rd)" d="{sroad.ROAD}"/>
      <path fill="#fff3d0" opacity=".5" d="{sroad.EDGES}"/>
      <path fill="#0e1431" d="{sroad.DASH}"/>
      <ellipse cx="270" cy="264" rx="140" ry="14" fill="#05081a" opacity=".55" filter="url(#soft)"/>
      {BIKE}
      <g fill="url(#back)">{BACK}</g>
      <g fill="url(#front)">{FRONT}</g>
    </g>
  </g>
</svg>
'''
if __name__ == "__main__":
  open(f"{sys.argv[1]}/icon.svg", "w").write(icon())
  open("square.svg", 'w').write(icon(tile=False))
  open("mask.svg", 'w').write(icon(tile=False, scale=0.8))
