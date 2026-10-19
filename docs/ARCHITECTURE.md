# Segue architecture

Segue is an offline-first day planner. A day is a set of **blocks** — what you want to do and what kind of place it needs. One tap rebuilds the rest of the day around your location, what's open, the weather, and the time and energy left.

## Principles

- **Blocks, not slots.** A block is *what* (2 h deep work) plus *requirements* (Wi-Fi, quiet, outdoors), not a place and a time.
- **Re-route in under a second.** Everything serves the loop: something changes → tap → new plan.
- **Works with bad signal.** The plan, the blocks and recently seen places live on the phone, and the engine runs there too.
- **Suggest, never force.** Re-routes are shown as a proposal with a change list, and they can be undone.
- **Cheap to run.** Paid map APIs are the main cost, so caching and budgets are part of the design.

## System

```
┌──────────────── Phone (PWA) ────────────────┐
│ React UI · IndexedDB store · service worker │
│ @segue/engine (offline re-route)            │
└───────────────┬─────────────────────────────┘
                │ HTTPS  POST /v1/reroute
┌───────────────▼─────────────────────────────┐
│ API (apps/api, node:http)                   │
│  validation (zod) · CORS · rate limit       │
│  Re-route Engine  ← @segue/engine           │
│  Places Gateway   ← @segue/providers        │
│    cache (geohash) → Google (budget) → OSM → mock
│  Context          ← Open-Meteo weather      │
└─────────────────────────────────────────────┘
```

## The engine (`packages/engine`)

The engine solves a small Orienteering Problem with Time Windows, using a heuristic so that a whole day plans in well under a second (about 0.2 s for 12 blocks × 40 places, including both alternatives).

**Inputs:** blocks; candidate places per block; context (now, end of day, location, energy, travel mode, UTC offset, hourly weather); the previous plan; pinned, done and skipped block ids; place affinity.

**Pipeline**

1. **Pin** fixed blocks (classes, meetings) and items the user pinned. Pinned blocks that clash are reported, never silently dropped.
2. **Filter** candidates that lack a hard requirement or are out of reach, and keep the 8 best by fit, rating, affinity and distance.
3. **Insert greedily**: must → should → nice, by deadline. Every insertion is checked by simulating the whole day, so travel, opening hours (including past-midnight hours), time windows and the end of day are always respected.
4. **Improve** with a bounded local search: relocate blocks, retry unscheduled ones, and swap a lower-priority block out for a must.
5. **Fallbacks**: a block runs as its no-place version (e.g. "bodyweight workout") only when no real place fits. Outdoor blocks are the exception, since rain can make the indoor version better.
6. **Explain**: each changed item gets a reason ("Starts when Night Lift opens at 4:00 PM", "Switched to X (was Y)", "Its window ended at 2:30 PM"). The plan also carries up to two open alternatives per item.

**Scoring:** block value is priority × requirement fit, minus travel, unconfirmed-hours, rain, energy-mismatch, time-preference and lateness penalties, plus quality and affinity bonuses. Weights live in `DEFAULT_WEIGHTS`. The alternatives are the same solve with different weights: *Less travel* and *Get more done*.

**Guarantees** (checked by property tests over thousands of random days): no overlaps; fixed blocks never move; flexible blocks stay inside now…end of day and their min–max duration; no place is used while it's known to be closed or known to lack a requirement; every block is either scheduled or reported with a reason; the result is deterministic.

## Places Gateway (`packages/providers`)

Every vendor sits behind `PlacesProvider` / `WeatherProvider`.

| Need | Default | Also |
| --- | --- | --- |
| Places + hours | OpenStreetMap Overpass (free) | Google Places API (New), mock |
| Weather | Open-Meteo (free) | — |

- `CachedPlacesProvider`: 24 h TTL keyed by geohash cell, category and radius bucket. Memory today; the `KeyValueStore` interface fits Redis.
- `FallbackPlacesProvider`: tries providers in order.
- `BudgetedPlacesProvider`: stops paid calls after a daily cap.
- The OSM `opening_hours` parser handles the common forms. Anything it can't honour becomes "hours unknown" rather than a guess.

**Philippines note:** jeepney, tricycle and UV routes aren't in routing data, so the `local` travel mode uses a moderate speed plus a waiting buffer.

## The app (`apps/web`)

- **Sky header:** a realistic animated sky drawn on a canvas (`src/lib/skyRenderer.ts`: clear, cloudy, rain, heavy rain, storm; day and night; paused when hidden or scrolled away), based on current conditions where the user is, with the weather in words and a location control (use, update, or how to unblock it). The Segue cloud floats in every sky. The last sky is saved on the phone; past 3 hours it stops claiming any weather. `?sky=storm&night=1` previews any sky.
- **Google Calendar:** an optional card in Blocks. Sign-in uses Google Identity Services in the browser (read-only scope `calendar.events.readonly`); the access token lives in memory only. Today's timed, busy events from the primary calendar are saved on the phone and become fixed `must` blocks at re-route time (`src/lib/calendar.ts`), so the engine plans around them and never moves them. Free, declined, cancelled and all-day events are left out. Without a live token, a re-route uses the events saved at the last sync and says how old they are. Segue never writes to the calendar.
- **Today:** a "Next up" hero (time, place, travel, whether it's open, Mark done / Directions / Other options), then the rest of the day, then blocks that didn't fit and why.
- **Re-route sheet:** location, end of day, energy, getting around. The result is a proposal showing *what changed* and up to three options.
- **Blocks:** blocks are stored with wall-clock times, so they repeat daily. They can be paused, edited and deleted.
- **Offline:** IndexedDB holds blocks, settings, today's plan and the last places the server returned. When the API is unreachable, the phone re-routes with the same engine and says the hours may have changed.
- Undo for the last re-route, pin a time, swap to a fallback, done/skip.
- Installable: web manifest, icons, and a service worker that caches the app shell.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/reroute` | Rebuild the rest of today. Returns `plan`, `alternatives`, `changes`, `candidates`, `meta`. |
| GET | `/v1/places/nearby?lat&lng&category&radius&limit` | Candidates for one category. |
| GET | `/v1/weather?lat&lng` | Hourly forecast. |
| GET | `/v1/weather/now?lat&lng` | Current conditions as one of five skies, for the app header. |
| GET | `/health` | Liveness and which providers are active. |

Requests are validated with the zod schemas in `packages/schemas`, and 400 responses list the failing fields. `/v1/reroute` is rate-limited per client (default 30 an hour), and bodies are capped at 256 KB.

## Decisions for the MVP

| Decision | Why | Later |
| --- | --- | --- |
| `node:http` instead of NestJS/Fastify | Zero framework and a tiny surface; easy to read and test | Move to Fastify or Nest when auth and more modules land |
| No database yet | The phone is the source of truth for one user | Postgres + PostGIS (`users`, `block_templates`, `day_plans`, `plan_versions`, `places`, `city_kits`, `events`) |
| In-memory cache | One instance is enough to start | Redis behind `KeyValueStore` |
| Raw IndexedDB wrapper | No dependency for 30 lines of code | Dexie if queries grow |
| Hand-written service worker | Full control of what's cached | Workbox if needed |

## Roadmap

1. **MVP (this repo):** blocks, Today view, manual re-route, places + greedy engine, installable PWA. *Gate: used for 10 real days.*
2. **Offline + context:** on-device re-route ✅, weather ✅, fallbacks ✅, explanations ✅, sync across devices. *Gate: works with no signal.*
3. **Smart triggers:** City Kits (go-to spots per city), prompts when you move more than about 2 km, a place closes, rain starts or a block overruns; Google Calendar busy times ✅ (read-only, primary calendar). *Gate: re-route p95 under 1.5 s.*
4. **Learn + scale:** learn weights from accepts, swaps and skips; shared plans; native wrapper (Capacitor); split the engine and gateway into their own services.

## Privacy

Calendar events are read from Google in the browser; their titles, times and locations go to the API only as part of a re-route (like any other block), and the Google token never leaves the phone. Location is sent only when re-routing or checking the sky (rounded to about 1 km for the sky), and the server doesn't store it. Plans and history stay on the device. API keys stay on the server.
