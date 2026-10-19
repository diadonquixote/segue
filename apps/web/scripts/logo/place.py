import math
from bike import bike
def on_road(road, s_at, size, toward_far=True):
    """Bike standing on the road's centreline at s_at, tilted to the road, sized to the road width there."""
    i = min(range(len(road.s)), key=lambda j: abs(road.s[j] - s_at))
    (x0, y0), (x1, y1) = road.pts[max(i - 3, 0)], road.pts[min(i + 3, len(road.pts) - 1)]
    ang = math.degrees(math.atan2(y1 - y0, x1 - x0))   # direction of travel toward the viewer
    ang = max(-16, min(16, ang))                         # steeper and it looks like it's falling over
    x, y = road.pts[i]
    k = size * road.w(s_at) / 100
    if toward_far:  # ride away from us, toward the cloud: face the other way
        return f'<g transform="translate({x:.1f} {y + road.w(s_at) * 0.12:.1f}) rotate({ang:.1f}) scale({-k:.3f} {k:.3f}) rotate(0)">{bike()}</g>', ang
    return f'<g transform="translate({x:.1f} {y:.1f}) rotate({ang:.1f}) scale({k:.3f})">{bike()}</g>', ang
