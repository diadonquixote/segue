/**
 * The HTTP surface. Kept framework-free on purpose for the MVP: node:http,
 * a tiny router, zod validation. Each route maps to a module from the
 * architecture doc (Re-route Engine, Places Gateway, Context service).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { reroute } from '@segue/engine';
import type { Place } from '@segue/engine';
import type { PlacesProvider, ReverseGeocoder, WeatherProvider } from '@segue/providers';
import { CurrentWeatherSchema, NearbyQuerySchema, RerouteRequestSchema, UnderstandRequestSchema, formatIssues } from '@segue/schemas';
import { gatherCandidates } from './candidates';
import type { Config } from './config';
import { DailyCap, RateLimiter } from './rateLimit';
import type { Understand } from './understand';

export interface AppDeps {
  config: Pick<Config, 'corsOrigins' | 'rerouteRateLimit'> &
    Partial<Pick<Config, 'smartAddRateLimit' | 'readRateLimit' | 'smartAddDailyCap' | 'clientIpHeader' | 'trustedProxyHops'>>;
  places: PlacesProvider;
  weather: WeatherProvider;
  /** Present when "Ask in your own words" is on. */
  understand?: Understand;
  /** Short place names for the location pin. */
  geocoder?: ReverseGeocoder;
  log?: (line: string) => void;
}

const MAX_BODY_BYTES = 256 * 1024;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(json), ...headers });
  res.end(json);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk as Buffer);
  }
  if (!size) throw new HttpError(400, 'Expected a JSON body');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Body is not valid JSON');
  }
}

/** lat/lng from the query string; a missing value must not read as 0. */
function latLngQuery(url: URL): { lat: number; lng: number } {
  const [lat, lng] = ['lat', 'lng'].map((k) => {
    const raw = url.searchParams.get(k);
    return raw === null || raw.trim() === '' ? NaN : Number(raw);
  });
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'lat and lng are required');
  return { lat: lat!, lng: lng! };
}

/**
 * About 1 km. The sky and the place name never need more, so the server rounds
 * too, even if a client sends an exact position. Nothing about it is stored.
 */
function coarse({ lat, lng }: { lat: number; lng: number }): { lat: number; lng: number } {
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

/** Add the user's saved places to each block that needs that kind of place. */
function withFavorites(candidates: Record<string, Place[]>, blocks: { id: string; category: string; fixed?: unknown }[], favorites: Place[] = []) {
  if (!favorites.length) return candidates;
  const out: Record<string, Place[]> = { ...candidates };
  for (const b of blocks) {
    if (b.fixed || b.category === 'none') continue;
    const mine = favorites.filter((f) => f.category === b.category);
    if (!mine.length) continue;
    const have = new Set((out[b.id] ?? []).map((p) => p.id));
    out[b.id] = [...mine.filter((f) => !have.has(f.id)), ...(out[b.id] ?? [])];
  }
  return out;
}

/**
 * Who is calling, for rate limits. A client can write anything into
 * x-forwarded-for, but each proxy of ours appends the address it saw to the
 * END, so the entry that counts is `hops` from the right, never the first.
 * A host that sets its own client-IP header can be named instead.
 */
export function clientKey(req: IncomingMessage, opts: { header?: string; hops?: number } = {}): string {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim();
  if (opts.header) {
    const named = one(req.headers[opts.header]);
    if (named) return named;
  }
  const hops = Math.max(1, opts.hops ?? 1);
  const chain = (one(req.headers['x-forwarded-for']) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const entry = chain.length >= hops ? chain[chain.length - hops] : undefined;
  return entry || req.socket.remoteAddress || 'unknown';
}

export function createApp(deps: AppDeps) {
  const limiter = new RateLimiter(deps.config.rerouteRateLimit, 60 * 60 * 1000);
  const understandLimiter = new RateLimiter(deps.config.smartAddRateLimit ?? 40, 60 * 60 * 1000);
  const readLimiter = new RateLimiter(deps.config.readRateLimit ?? 300, 60 * 60 * 1000);
  const understandCap = new DailyCap(deps.config.smartAddDailyCap ?? 300);
  const who = (req: IncomingMessage) => clientKey(req, { header: deps.config.clientIpHeader, hops: deps.config.trustedProxyHops });
  /** Places, weather and place names each reach a free service that bans heavy callers. */
  const limitRead = (req: IncomingMessage) => {
    const retryAfter = readLimiter.hit(who(req));
    if (retryAfter) throw new HttpError(429, 'Too many requests, try again later', undefined, { 'retry-after': String(retryAfter) });
  };
  const log = deps.log ?? ((l: string) => console.log(l));
  const allowAll = deps.config.corsOrigins.includes('*');

  function corsHeaders(req: IncomingMessage): Record<string, string> {
    const origin = req.headers.origin;
    if (!origin) return {};
    if (!allowAll && !deps.config.corsOrigins.includes(origin)) return {};
    return {
      'access-control-allow-origin': allowAll ? '*' : origin,
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
      vary: 'Origin',
    };
  }

  async function route(req: IncomingMessage, url: URL): Promise<{ status: number; body: unknown }> {
    const method = req.method ?? 'GET';

    if (method === 'GET' && url.pathname === '/health') {
      return { status: 200, body: { ok: true, places: deps.places.name, weather: deps.weather.name, smartAdd: !!deps.understand } };
    }

    if (method === 'GET' && url.pathname === '/v1/places/nearby') {
      limitRead(req);
      const parsed = NearbyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) throw new HttpError(400, 'Invalid query', formatIssues(parsed.error));
      const q = parsed.data;
      const places = await deps.places.nearby({ location: { lat: q.lat, lng: q.lng }, radiusM: q.radius, category: q.category, limit: q.limit });
      return { status: 200, body: { places } };
    }

    if (method === 'GET' && url.pathname === '/v1/weather/now') {
      limitRead(req);
      const { lat, lng } = coarse(latLngQuery(url));
      try {
        // Checked against the wire schema, so the app never gets a sky it can't draw.
        return { status: 200, body: { now: CurrentWeatherSchema.parse(await deps.weather.current({ lat, lng })) } };
      } catch (e) {
        log(`current weather failed: ${(e as Error).message}`);
        throw new HttpError(503, 'Weather is unavailable right now');
      }
    }

    if (method === 'GET' && url.pathname === '/v1/place-name') {
      limitRead(req);
      const { lat, lng } = coarse(latLngQuery(url));
      if (!deps.geocoder) return { status: 200, body: { name: null } };
      try {
        return { status: 200, body: { name: await deps.geocoder.placeName({ lat, lng }) } };
      } catch (e) {
        log(`place name failed: ${(e as Error).message}`);
        // No name is fine: the app just says "Your location".
        return { status: 200, body: { name: null } };
      }
    }

    if (method === 'GET' && url.pathname === '/v1/weather') {
      limitRead(req);
      const { lat, lng } = coarse(latLngQuery(url));
      return { status: 200, body: { hours: await deps.weather.forecast({ lat, lng }) } };
    }

    if (method === 'POST' && url.pathname === '/v1/understand') {
      if (!deps.understand) throw new HttpError(404, 'Smart add is off on this server');
      const parsed = UnderstandRequestSchema.safeParse(await readJson(req));
      if (!parsed.success) throw new HttpError(400, 'Invalid request', formatIssues(parsed.error));
      // Counted after validation: only requests that would reach Claude use up the allowance.
      const retryAfter = understandLimiter.hit(who(req));
      if (retryAfter) throw new HttpError(429, 'Too many requests, try again later', undefined, { 'retry-after': String(retryAfter) });
      // The shared daily budget comes last, so a client that is already limited doesn't spend it.
      if (!understandCap.take()) throw new HttpError(503, 'Smart add is resting for today, try again tomorrow');
      try {
        return { status: 200, body: { blocks: await deps.understand(parsed.data.text, parsed.data.localTime) } };
      } catch (e) {
        log(`understand failed: ${(e as Error).message}`);
        throw new HttpError(502, "Couldn't read that right now");
      }
    }

    if (method === 'POST' && url.pathname === '/v1/reroute') {
      const retryAfter = limiter.hit(who(req));
      if (retryAfter) throw new HttpError(429, 'Too many re-routes, try again later', undefined, { 'retry-after': String(retryAfter) });

      const parsed = RerouteRequestSchema.safeParse(await readJson(req));
      if (!parsed.success) throw new HttpError(400, 'Invalid re-route request', formatIssues(parsed.error));
      const body = parsed.data;
      const started = performance.now();
      const warnings: string[] = [];

      const [candidateResult, weather] = await Promise.all([
        body.candidates
          ? Promise.resolve({ candidates: body.candidates, warnings: [] as string[] })
          : gatherCandidates(deps.places, body.blocks, body.context.location, body.context.mode),
        body.context.weather
          ? Promise.resolve(body.context.weather)
          : deps.weather.forecast(body.context.location).catch((e: Error) => {
              log(`weather failed: ${e.message}`);
              warnings.push("No weather forecast right now, so rain isn't factored in.");
              return [];
            }),
      ]);
      warnings.push(...candidateResult.warnings);
      const candidates = withFavorites(candidateResult.candidates, body.blocks, body.favorites);

      const result = reroute({
        blocks: body.blocks,
        candidates,
        context: { ...body.context, weather },
        previous: body.previous,
        lockedBlockIds: body.lockedBlockIds,
        doneBlockIds: body.doneBlockIds,
        affinity: body.affinity,
      });

      return {
        status: 200,
        body: {
          ...result,
          // Sent back so the phone can cache them and re-route offline.
          candidates,
          meta: {
            placesProvider: body.candidates ? 'client' : deps.places.name,
            weather: weather.length > 0,
            warnings,
            engineMs: Math.round(performance.now() - started),
          },
        },
      };
    }

    throw new HttpError(404, `No route for ${method} ${url.pathname}`);
  }

  return async function handler(req: IncomingMessage, res: ServerResponse) {
    const t0 = performance.now();
    const cors = corsHeaders(req);
    const url = new URL(req.url ?? '/', 'http://localhost');
    let status = 500;
    try {
      if (req.method === 'OPTIONS') {
        status = 204;
        res.writeHead(204, cors);
        res.end();
        return;
      }
      const out = await route(req, url);
      status = out.status;
      send(res, out.status, out.body, cors);
    } catch (e) {
      if (e instanceof HttpError) {
        status = e.status;
        send(res, e.status, { error: e.message, details: e.details }, { ...cors, ...e.headers });
      } else {
        status = 500;
        log(`error ${(e as Error).stack ?? e}`);
        send(res, 500, { error: 'Internal error' }, cors);
      }
    } finally {
      log(`${req.method} ${url.pathname} ${status} ${Math.round(performance.now() - t0)}ms`);
    }
  };
}
