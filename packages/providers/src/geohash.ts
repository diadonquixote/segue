const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/** Standard geohash. Precision 6 ≈ 1.2 km × 0.6 km cells; 7 ≈ 150 m. */
export function geohash(lat: number, lng: number, precision = 6): string {
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
  let hash = '';
  let bit = 0;
  let ch = 0;
  let even = true;
  while (hash.length < precision) {
    if (even) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) { ch |= 1 << (4 - bit); lngLo = mid; } else lngHi = mid;
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { ch |= 1 << (4 - bit); latLo = mid; } else latHi = mid;
    }
    even = !even;
    if (bit < 4) bit++;
    else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}
