/**
 * The re-route flow, online or off:
 *   1. Ask the API (it finds nearby places, checks weather, runs the engine).
 *   2. If that fails, run the same engine on the phone against the places
 *      cached from the last successful call. Hours can't be re-verified, but
 *      the user still gets a plan in under a second.
 */
import { haversineMeters, reroute, type Context, type Place, type Plan, type RerouteResult } from '@segue/engine';
import { toEngineBlock, type DayState, type PlaceCache, type StoredBlock } from './model';

export const API_URL: string = (import.meta.env?.VITE_API_URL as string | undefined) ?? 'http://localhost:8787';

export interface RerouteOutcome extends RerouteResult {
  source: 'server' | 'device';
  warnings: string[];
  /** fresh places to cache, when the server sent them */
  placeCache?: PlaceCache;
}

interface ServerResponse extends RerouteResult {
  candidates: Record<string, Place[]>;
  meta: { warnings: string[] };
}

/** Cached places are only trusted within this distance of where they were fetched. */
const CACHE_RADIUS_M = 8000;

function cacheFromCandidates(blocks: StoredBlock[], candidates: Record<string, Place[]>, ctx: Context): PlaceCache {
  const byCategory: PlaceCache['byCategory'] = {};
  for (const b of blocks) {
    const list = candidates[b.id];
    if (list?.length) byCategory[b.category] = list;
  }
  return { savedAt: new Date().toISOString(), location: ctx.location, byCategory };
}

function candidatesFromCache(blocks: StoredBlock[], cache: PlaceCache | undefined, ctx: Context): Record<string, Place[]> {
  const out: Record<string, Place[]> = {};
  if (!cache || haversineMeters(cache.location, ctx.location) > CACHE_RADIUS_M) return out;
  for (const b of blocks) out[b.id] = cache.byCategory[b.category] ?? [];
  return out;
}

export async function rerouteDay(opts: {
  blocks: StoredBlock[];
  context: Context;
  day: DayState;
  placeCache?: PlaceCache;
  forceOffline?: boolean;
}): Promise<RerouteOutcome> {
  const now = new Date(opts.context.now);
  const active = opts.blocks.filter((b) => b.active);
  const engineBlocks = active.map((b) => toEngineBlock(b, now));
  const shared = {
    blocks: engineBlocks,
    context: opts.context,
    previous: opts.day.plan as Plan | undefined,
    lockedBlockIds: opts.day.lockedIds,
    doneBlockIds: [...opts.day.doneIds, ...opts.day.skippedIds],
  };

  if (!opts.forceOffline && engineBlocks.length) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch(`${API_URL}/v1/reroute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(shared),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer));
      if (res.ok) {
        const body = (await res.json()) as ServerResponse;
        return {
          plan: body.plan,
          alternatives: body.alternatives,
          changes: body.changes,
          source: 'server',
          warnings: body.meta?.warnings ?? [],
          placeCache: cacheFromCandidates(active, body.candidates ?? {}, opts.context),
        };
      }
      if (res.status === 429) throw new Error('rate');
    } catch {
      // fall through to on-device
    }
  }

  const candidates = candidatesFromCache(active, opts.placeCache, opts.context);
  const hasCache = Object.values(candidates).some((l) => l.length);
  const result = reroute({ ...shared, candidates });
  const warnings = [
    hasCache
      ? 'Offline: planned on your phone with places saved from your last connection. Opening hours may have changed.'
      : 'Offline and no saved places near here: blocks that need a place use their fallback.',
  ];
  return { ...result, source: 'device', warnings };
}
