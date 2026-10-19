# Logo generator

The app icon and the wordmark are generated, so the road's perspective, the dashes and the rider stay consistent when anything changes.

| File | What it draws |
| --- | --- |
| `persp.py` | A road along Bézier curves that widens toward the viewer, with dashes that grow with it |
| `sroad.py` | The S-shaped road and the two-layer cloud used in the icon |
| `bike.py` | The rider on the motorcycle (black bike, black shirt, white helmet, gold scarf) |
| `place.py` | Puts the rider on a road, tilted to it and sized to its width at that point |
| `build_final.py` | Writes `icon.svg`, plus `square.svg` and `mask.svg` for the PNG icons |
| `wordmark.py` | Writes `wordmark.svg` and `wordmark-light.svg`: the road-S, then "egue" from Bricolage Grotesque outlines |

## Regenerate

Run from this folder (Python 3, no packages needed for the icon):

```bash
python3 build_final.py ../../public          # icon.svg; square.svg and mask.svg land here
```

The wordmark needs [fontTools](https://pypi.org/project/fonttools/) and the variable [Bricolage Grotesque](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque) font:

```bash
python3 -m pip install --target ./.pylib fonttools
BIKE=0.88,1.1 python3 wordmark.py ./.pylib path/to/BricolageGrotesque.ttf 750 ../../public
```

`BIKE` is where the rider sits on the S (0 = far end under the cloud, 1 = near end) and how big; `BIKE=0,0` leaves the rider out.

## PNG icons

Render `icon.svg` at 192 and 512 px (`icon-192.png`, `icon-512.png`), `mask.svg` at 512 px (`icon-512-maskable.png`) and `square.svg` at 180 px (`apple-touch-icon.png`), with a transparent background for the rounded ones. Any SVG renderer works; headless Chrome does it with `--screenshot --window-size=512,512 --default-background-color=00000000`.

After changing icons, bump `VERSION` in `public/sw.js` so installed apps pick them up.
