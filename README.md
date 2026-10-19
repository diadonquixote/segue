# Segue

**A day planner that re-routes itself when life goes off-script.**

Calendars assume you stay put. When you're always moving city to city, one missed ride or a closed café breaks the whole day. Segue plans your day as flexible **blocks**: what you want to do, and what kind of place it needs, not a fixed time and address. When something changes, tap **Re-route from here** and it rebuilds the rest of the day around where you are, what's open, the weather, and how much time and energy you have left.

> *Segue* (n.) — in music, moving from one piece into the next without a pause.

## What's in the box

| Path | What it is |
| --- | --- |
| `packages/engine` | The re-routing engine. Pure TypeScript, no I/O, so it runs on the server **and** offline on the phone. Greedy insertion + local search, opening hours, travel time, rain, energy, fallbacks, explanations, and plan diffs. |
| `packages/schemas` | Zod schemas for every request and record. |
| `packages/providers` | Places (OpenStreetMap, Google Places, mock), weather (Open-Meteo), and the Places Gateway cost controls: geohash cache, fallback chain, daily budget. |
| `apps/api` | HTTP API (`POST /v1/reroute`, `GET /v1/places/nearby`, `GET /v1/weather`, `GET /health`). Zero-framework Node server with validation, CORS and rate limits. |
| `apps/web` | Installable PWA (React + Vite). Today view, blocks, re-route sheet with alternatives and a change list, undo, pin, done/skip, offline re-route on the device. |
| `docs/ARCHITECTURE.md` | How it fits together, and the roadmap. |

## Quick start

Requires Node 20+ and pnpm 10.

```bash
pnpm install
cp .env.example .env          # optional, defaults work

# Terminal 1 — API on :8787 (free OpenStreetMap data by default)
pnpm dev:api

# Terminal 2 — web app on :5173
pnpm dev:web
```

Open http://localhost:5173. The app seeds a starter day (deep work, lunch, gym, groceries, a call) and plans it from your location.

**No network or rate-limited?** Run the API with made-up places:

```bash
PLACES_PROVIDER=mock pnpm dev:api
```

**Using Google Places** (better hours and ratings, paid):

```bash
PLACES_PROVIDER=google GOOGLE_PLACES_API_KEY=... pnpm dev:api
```

Google calls are capped per day (`GOOGLE_DAILY_BUDGET`, default 500) and fall back to OpenStreetMap, then mock data.

**Connecting Google Calendar** (meetings and classes become fixed blocks the day is planned around):

1. In [Google Cloud Console](https://console.cloud.google.com/), create or pick a project and enable the **Google Calendar API**.
2. Under **Google Auth Platform → Branding/Audience**, set up the consent screen. While the app is in *Testing*, add your own Google account as a test user.
3. Under **Data Access**, add the scope `https://www.googleapis.com/auth/calendar.events.readonly`.
4. Under **Clients**, create an OAuth client of type **Web application**. Add `http://localhost:5173` (and your production URL) to **Authorized JavaScript origins**. No redirect URI is needed.
5. Put the client ID in `apps/web/.env`:

   ```bash
   cp apps/web/.env.example apps/web/.env   # then set VITE_GOOGLE_CLIENT_ID=…apps.googleusercontent.com
   ```

6. Restart `pnpm dev:web`, open **Blocks**, and tap **Connect Google Calendar**.

Segue only reads your primary calendar, and only today's timed events; it never changes your calendar. Sign-in happens in the browser and the short-lived token stays in memory, so the API never sees it. To let other people connect, Google has to verify the app for this scope (publish the consent screen and submit it for review).

## Scripts

```bash
pnpm test        # all unit, scenario, property and API tests
pnpm typecheck   # strict TypeScript across the monorepo
pnpm build       # web → apps/web/dist, API → apps/api/dist/server.js
pnpm --filter @segue/engine bench   # engine speed on a busy day
```

## How a re-route works

1. The app sends your blocks, location, time, energy and travel mode to `POST /v1/reroute`.
2. The API looks up nearby places per category (cache first), plus the hourly forecast.
3. The engine filters out places that are closed or lack what a block needs. It then builds a plan greedily (must-dos first) and improves it with a short local search.
4. It returns the best plan, up to two alternatives ("Less travel", "Get more done"), a per-block change list, and the places it used so the phone can re-route offline next time.
5. If the API can't be reached, the phone runs the same engine against those saved places and says so.

## Status

This is the Phase 1 MVP from the architecture doc, with parts of Phase 2 (offline re-route, weather, fallbacks, explanations). Google Calendar events can be brought in as fixed blocks. Next up: accounts and sync (Postgres + PostGIS), City Kits, and location and closure triggers. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
