import persp
from persp import Road, total_length
def road(segs, far, near, power):
    r = Road(segs, far, near, power); r.total = total_length(segs); return r
R = road([((262,250),(262,282),(176,282),(176,326)), ((176,326),(176,378),(350,366),(350,426)), ((350,426),(350,484),(250,504),(238,600))], 6, 280, 2.2)
ROAD, DASH = R.band(), R.dashes(start=0.05, dash=0.5, gap=0.7, thick=0.06)
EDGES = R.band(lo=0.42, hi=0.47) + ' ' + R.band(lo=-0.47, hi=-0.42)

def shapes(circles, rects=()):
    out = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}"/>' for x, y, r in circles)
    out += ''.join(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/>' for x, y, w, h, rx in rects)
    return out

DEFS = '''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#1a2556"/><stop offset="1" stop-color="#0e1431"/></linearGradient>
<linearGradient id="rd" x1="0" y1="240" x2="0" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a77d2c"/><stop offset="1" stop-color="#ffd36e"/></linearGradient>
<linearGradient id="front" x1="0" y1="120" x2="0" y2="262" gradientUnits="userSpaceOnUse"><stop offset=".35" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe5f5"/></linearGradient>
<linearGradient id="back" x1="0" y1="60" x2="0" y2="240" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c4cdf2"/><stop offset="1" stop-color="#8e9bd6"/></linearGradient>
<filter id="soft" x="-20%" y="-100%" width="140%" height="300%"><feGaussianBlur stdDeviation="9"/></filter>'''

def icon(cloud_svg, shadow=(262, 262, 130), size='SIZE', clip=True):
    sx, sy, srx = shadow
    clip_def = '<clipPath id="t"><rect width="512" height="512" rx="112"/></clipPath>' if clip else ''
    g = '<g clip-path="url(#t)">' if clip else '<g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}"><defs>{clip_def}{DEFS}</defs>{g}'
            f'<rect width="512" height="512" fill="url(#bg)"/><path fill="url(#rd)" d="{ROAD}"/><path fill="#fff3d0" opacity=".5" d="{EDGES}"/>'
            f'<path fill="#0e1431" d="{DASH}"/><ellipse cx="{sx}" cy="{sy}" rx="{srx}" ry="14" fill="#05081a" opacity=".55" filter="url(#soft)"/>'
            f'{cloud_svg}</g></svg>')

CLOUDS = {
 # two layers: a periwinkle cloud behind, a white one in front and lower right, so it has depth
 'Layered': (f'<g fill="url(#back)">{shapes([(196,170,58),(262,128,72),(326,160,50)], [(138,160,236,60,30)])}</g>'
             f'<g fill="url(#front)">{shapes([(236,214,40),(300,190,56),(360,218,38)], [(196,206,202,52,26)])}</g>', (296, 262, 104)),
 # one tall billowing tower on the left, trailing off low to the right
 'Billow': (f'<g fill="url(#front)">{shapes([(160,212,40),(214,160,66),(270,118,58),(312,176,52),(366,214,34),(408,230,22)], [(120,210,310,48,24)])}</g>', (262, 262, 140)),
 # layered and billowing together
 'Layered billow': (f'<g fill="url(#back)">{shapes([(208,150,58),(272,104,56),(320,150,46)], [(150,150,214,64,32)])}</g>'
                    f'<g fill="url(#front)">{shapes([(172,224,34),(222,196,50),(286,168,62),(346,206,44),(396,226,26)], [(138,218,280,44,22)])}</g>', (270, 264, 140)),
 # a softer, wider cloud with a rounded belly instead of a flat base
 'Soft belly': (f'<g fill="url(#front)">{shapes([(170,214,44),(230,166,64),(300,150,70),(362,198,50)])}<ellipse cx="266" cy="226" rx="144" ry="38"/></g>', (266, 268, 136)),
}
if __name__ == '__main__':
    import json
    cards = ''.join(f'''<figure style="margin:0;background:#fff;border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:10px;align-items:center">
<div style="display:flex;gap:12px;align-items:flex-end">{icon(c, sh).replace("SIZE","220")}<div style="display:flex;flex-direction:column;gap:8px;align-items:center">{icon(c, sh).replace("SIZE","64")}{icon(c, sh).replace("SIZE","32")}{icon(c, sh).replace("SIZE","20")}</div></div>
<figcaption style="font:600 17px -apple-system">{chr(65+i)}. {k}</figcaption></figure>''' for i, (k, (c, sh)) in enumerate(CLOUDS.items()))
    open('sroad.html','w').write(f'''<!doctype html><meta charset="utf-8"><title>Segue logo: S road</title><body style="margin:0;padding:24px;background:#e9ecf3;font-family:-apple-system,sans-serif">
<h1 style="margin:0 0 18px;font-size:22px">S road, with a cloud of its own</h1><div style="display:grid;grid-template-columns:repeat(2,minmax(330px,1fr));gap:16px;max-width:860px">{cards}</div></body>''')
