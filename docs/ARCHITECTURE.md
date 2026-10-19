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

**Pages.** `/` is the landing page (what Segue does, a live plain-words demo, a sky you can switch between weathers, privacy, and a link into the app). Everything else lives under `/app`: `/app` (Today), `/app/plan` (Plan my day), `/app/routines`, and `/app/calendar` (Google Calendar). A tiny History-API router (`src/lib/router.ts`) switches between them; the landing page and the app are separate chunks, so the landing page stays light. The installed app opens at `/app`.

- **Plan my day (`/app/plan`):** the deliberate planning screen, separate from Today. Set when the day ends, how you're feeling and how you get around; switch calendar events and routines in or out *for today only* (`DayState.excludedIds`, so they come back tomorrow); add today-only items; see a running total against the time left; and see the whole day on an hour grid with a line for now and travel between stops. **Plan my day** builds the plan; once there is one, it becomes **Re-plan my day** and shows the proposal first.
- **Google Calendar (`/app/calendar`):** a full screen for connecting. Before connecting it says exactly what Segue reads and skips and that it never writes; after, it lists today's events with a switch to leave any of them out of today's plan, Sync now, and Disconnect. Settings and the Plan screen link to it; first-run setup keeps an inline connect card.
- **Sky header:** a realistic animated sky drawn on a canvas (`src/lib/skyRenderer.ts`: clear, cloudy, rain, heavy rain, storm; day and night; paused when hidden or scrolled away), based on current conditions where the user is, with the weather in words and a location control (use, update, or how to unblock it). The Segue cloud floats in every sky. The last sky is saved on the phone; past 3 hours it stops claiming any weather. `?sky=storm&night=1` previews any sky.
- **First run:** three short steps instead of a fake seeded day: location (optional), how you get around and when the day ends, then what's on today in plain words (or connect Google Calendar, or try an example day).
- **Add in plain words:** `src/lib/quickAdd.ts` turns "Gym 1h after 5pm", "Lunch with Ana 12:30 at Greenbelt" or "Standup 9:30-10" into a block on the phone, instantly and offline, and shows what it understood as chips. Things added this way are for today only; routines repeat. When the parser isn't sure and the server has smart add on, the user can tap **Let Segue read it** to send just that note to `POST /v1/understand` (Claude, structured output, clamped to the schema limits).
- **Today is a timeline:** one status line (details on tap), nudge banners, the add bar, a Next-up card ("in 25 min", Done / Directions / Details), then the rest of the day with travel legs, free gaps you can fill with one tap, and what didn't fit. Rows swipe right for done and left to skip; tapping opens the item.
- **Item details:** "Why this?" in plain reasons, change the time (moves and pins it), backups, pin, Save to My spots, Add to Google Calendar (a template link, no extra permission) and directions.
- **One-tap re-route:** the dock button plans straight away with saved settings, and the sheet offers reasons: *Running late* (starts 15 min later), *It's raining* (rain for the rest of the day, so outdoor blocks move inside), *I'm tired* (low energy), *I'm somewhere else* (fresh location), *Something came up* (keeps the next hour free). Each is a small, testable change to the engine input (`src/lib/replan.ts`). The result is still a proposal you accept, with alternatives and a change list.
- **Nudges and reminders:** `src/lib/nudges.ts` works out *Leave by…* (with directions), *Still on…?* (something ran over) and *It's raining: X is outside*. They show in the app, and with Reminders on they're also system notifications while Segue is open or in the background. Notifications with the app fully closed need a push server, which comes with accounts.
- **Learning and My spots:** done and skipped items update a per-place history on the phone; with saved places it becomes the engine's `affinity`, so places you keep going back to win ties. Saved places are also sent as `favorites` and always considered for blocks of their kind, online and offline.
- **Undo:** every change to the day (re-route, done, skip, move, swap) can be undone, up to ten steps, from the toast.
- **Routines and Settings:** Routines lists today-only items and everyday routines; the block form asks for a name and keeps the rest under "More options". Settings holds end of day, travel mode, location, reminders, °C/°F, My spots, Google Calendar and Start over.
- **Sky header:** a realistic animated sky drawn on a canvas (`src/lib/skyRenderer.ts`: clear, cloudy, rain, heavy rain, storm; day and night; paused when hidden or scrolled away), based on current conditions where the user is, with the weather on one line and a location pill. The Segue cloud floats in every sky. The last sky is saved on the phone; past 3 hours it stops claiming any weather. `?sky=storm&night=1` previews any sky.
- **Google Calendar:** in Settings (and the first-run setup). Sign-in uses Google Identity Services in the browser with read-only scopes (`calendar.events.readonly`, plus `calendar.calendarlist.readonly` to read every calendar that's switched on; without it, just the main one); the access token lives in memory only. Today's timed, busy events are saved on the phone, duplicates across calendars collapse, and they become fixed `must` blocks at re-route time (`src/lib/calendar.ts`). Free, declined, cancelled and all-day events are left out. Without a live token, a re-route uses the last sync and says how old it is. Segue never writes to the calendar.
- **Offline:** IndexedDB holds blocks, settings, today's plan, places from the last server answer, My spots and place history. When the API is unreachable, the phone re-routes with the same engine and says the hours may have changed.
- Installable: web manifest, icons (generated, see `apps/web/scripts/logo`), and a service worker that caches the app shell and opens Segue when a reminder is tapped.

## Travel time

The engine estimates door-to-door minutes per mode (with a detour factor, a walking cut-off for short hops, and a waiting buffer for jeepney, tricycle and UV trips). Rides leaving on weekdays 7–10 AM and 5–8 PM local are 1.5× longer (`trafficAware` in `geo.ts`); walking isn't affected. A real routing matrix can replace all of this through `RerouteInput.travel`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/v1/reroute` | Rebuild the rest of today. Returns `plan`, `alternatives`, `changes`, `candidates`, `meta`. |
| GET | `/v1/places/nearby?lat&lng&category&radius&limit` | Candidates for one category. |
| GET | `/v1/weather?lat&lng` | Hourly forecast. |
| GET | `/v1/weather/now?lat&lng` | Current conditions as one of five skies, for the app header. |
| POST | `/v1/understand` | `{text, localTime}` → blocks read from a plain-words note by Claude. Only when smart add is on; 404 otherwise. |
| GET | `/health` | Liveness, which providers are active, and whether smart add is on. |

Requests are validated with the zod schemas in `packages/schemas`, and 400 responses list the failing fields. `/v1/reroute` is rate-limited per client (default 60 an hour) and `/v1/understand` separately (default 40 an hour, counted only for valid requests, since each one costs money). Bodies are capped at 256 KB. `/v1/reroute` also accepts `favorites` (the user's saved places), which join the candidates for blocks of their kind.

**Smart add** uses `claude-opus-5-5` through the Anthropic SDK with structured output (a Zod schema), low effort, and the server-side refusal fallback. It's on when `ANTHROPIC_API_KEY` is set (or `SMART_ADD=on` with other Anthropic credentials) and off with `SMART_ADD=off`. The answer is clamped to what the schemas accept before it's returned, and the engine plans it like any other block.

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
2. **Offline + context:** on-device re-route ✅, weather ✅, fallbacks ✅, explanations ✅, sync across devices (needs accounts). *Gate: works with no signal.*
3. **Smart triggers:** My spots ✅ (City Kits per city next), nudges for leaving, running over and rain ✅, rush-hour travel ✅, Google Calendar busy times ✅ (read-only, all switched-on calendars); still to do: prompts when you move more than about 2 km or a place closes, push notifications with the app closed. *Gate: re-route p95 under 1.5 s.*
4. **Learn + scale:** place preferences from done and skipped ✅; learn durations and weights from accepts, swaps and skips; shared plans; native wrapper (Capacitor); split the engine and gateway into their own services.

## Privacy

Notes sent to smart add go to Anthropic to be read and aren't stored by Segue; the phone only sends one when the user taps **Let Segue read it**. Calendar events are read from Google in the browser; their titles, times and locations go to the API only as part of a re-route (like any other block), and the Google token never leaves the phone. Location is sent only when re-routing or checking the sky (rounded to about 1 km for the sky), and the server doesn't store it. Plans and history stay on the device. API keys stay on the server.
