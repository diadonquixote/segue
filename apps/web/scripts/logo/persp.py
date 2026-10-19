import math

def cubic(p, t):
    (x0,y0),(x1,y1),(x2,y2),(x3,y3) = p
    m = 1-t
    return (m**3*x0+3*m*m*t*x1+3*m*t*t*x2+t**3*x3, m**3*y0+3*m*m*t*y1+3*m*t*t*y2+t**3*y3)

def sample(segs, n=400):
    """Points along a chain of cubic segments, with cumulative arc length normalised to 0..1."""
    pts = []
    for i, seg in enumerate(segs):
        for j in range(n):
            if i and j == 0: continue
            pts.append(cubic(seg, j/(n-1)))
    L = [0.0]
    for a, b in zip(pts, pts[1:]): L.append(L[-1] + math.dist(a, b))
    return pts, [l/L[-1] for l in L]

def normals(pts):
    out = []
    for i in range(len(pts)):
        a = pts[max(i-1,0)]; b = pts[min(i+1,len(pts)-1)]
        dx, dy = b[0]-a[0], b[1]-a[1]; l = math.hypot(dx,dy) or 1
        out.append((-dy/l, dx/l))
    return out

def fmt(ps): return 'M' + ' L'.join(f'{x:.0f} {y:.0f}' for x,y in ps) + 'Z'

class Road:
    def __init__(self, segs, far, near, power=1.7):
        self.pts, self.s = sample(segs)
        self.n = normals(self.pts)
        self.far, self.near, self.power = far, near, power
    def w(self, s): return self.far + (self.near-self.far) * s**self.power
    def band(self, a=0.0, b=1.0, lo=-0.5, hi=0.5):
        """Polygon between offsets lo..hi (as a fraction of the local width), for s in a..b."""
        L, R = [], []
        for (x,y),(nx,ny),s in zip(self.pts, self.n, self.s):
            if s < a or s > b: continue
            w = self.w(s)
            L.append((x+nx*w*hi, y+ny*w*hi)); R.append((x+nx*w*lo, y+ny*w*lo))
        return fmt(L + R[::-1])
    def dashes(self, start=0.02, dash=0.9, gap=1.1, thick=0.07):
        """Centre dashes whose length and spacing grow with the road: nearer means bigger."""
        out, s = [], start
        while s < 1:
            # step along in arc-length units scaled by the local width
            step = lambda k: k * self.w(s) / self.total
            e = s + step(dash)
            out.append(self.band(s, min(e, 1), -thick/2, thick/2))
            s = e + step(gap)
        return ' '.join(out)

def total_length(segs):
    pts, _ = sample(segs)
    return sum(math.dist(a,b) for a,b in zip(pts, pts[1:]))

def _cross(p, q, r, s):
    """Intersection point of segments pq and rs, or None."""
    d = (q[0]-p[0])*(s[1]-r[1]) - (q[1]-p[1])*(s[0]-r[0])
    if abs(d) < 1e-9: return None
    t = ((r[0]-p[0])*(s[1]-r[1]) - (r[1]-p[1])*(s[0]-r[0])) / d
    u = ((r[0]-p[0])*(q[1]-p[1]) - (r[1]-p[1])*(q[0]-p[0])) / d
    if 0 < t < 1 and 0 < u < 1: return (p[0]+t*(q[0]-p[0]), p[1]+t*(q[1]-p[1]))
    return None

def unloop(pts, window=160):
    """Cut out the small loops an offset edge makes on the inside of a tight bend."""
    out, i = [], 0
    while i < len(pts) - 1:
        out.append(pts[i])
        hit = None
        for j in range(min(len(pts) - 2, i + window), i + 1, -1):
            x = _cross(pts[i], pts[i+1], pts[j], pts[j+1])
            if x: hit = (j, x); break
        if hit:
            out.append(hit[1]); i = hit[0] + 1
        else:
            i += 1
    out.append(pts[-1])
    return out

def _band(self, a=0.0, b=1.0, lo=-0.5, hi=0.5):
    L, R = [], []
    for (x,y),(nx,ny),s in zip(self.pts, self.n, self.s):
        if s < a or s > b: continue
        w = self.w(s)
        L.append((x+nx*w*hi, y+ny*w*hi)); R.append((x+nx*w*lo, y+ny*w*lo))
    return fmt(unloop(L) + unloop(R)[::-1])
Road.band = _band
