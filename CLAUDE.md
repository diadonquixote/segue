# Segue — notes for Claude Code

Day planner that re-routes the rest of the day from current context. pnpm + Turborepo monorepo, TypeScript everywhere. Read `docs/ARCHITECTURE.md` before larger changes.

## Commands

- `pnpm install`
- `pnpm dev:api` (port 8787; `PLACES_PROVIDER=mock` for offline data) · `pnpm dev:web` (port 5173)
- `pnpm test` · `pnpm typecheck` · `pnpm build`
- One package: `pnpm --filter @segue/engine test`

## Layout

- `packages/engine` — pure re-routing engine. **No I/O, no `Date.now()`, no randomness**: everything comes in through `RerouteInput`. It runs on the phone, so keep it dependency-free.
- `packages/schemas` — zod wire schemas; they `satisfies` the engine types, so change both together.
- `packages/providers` — places/weather adapters + cache/fallback/budget. Every provider takes an injectable `fetch` for tests.
- `apps/api` — `node:http` server; `createApp(deps)` is testable without listening.
- `apps/web` — React + Vite PWA; state persists to IndexedDB (`src/lib/store.ts`).

## Conventions

- Engine changes need tests in `packages/engine/test`; keep `properties.test.ts` passing (it checks no overlaps, fixed blocks never move, no closed places).
- User-facing copy: plain words, sentence case, say what happened and what to do. No raw error messages in the UI.
- Times on the wire are ISO 8601; stored blocks use local "HH:MM" and are dated at re-route time.
