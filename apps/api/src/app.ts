/**
 * The HTTP surface. Kept framework-free on purpose for the MVP: node:http,
 * a tiny router, zod validation. Each route maps to a module from the
 * architecture doc (Re-route Engine, Places Gateway, Context service).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { reroute } from '@segue/engine';
import type { PlacesProvider, WeatherProvider } from '@segue/providers';
import { NearbyQuerySchema, RerouteRequestSchema, formatIssues } from '@segue/schemas';
import { gatherCandidates } from './candidates';
import type { Config } from './config';
import { RateLimiter } from './rateLimit';

export interface AppDeps {
  config: Pick<Config, 'corsOrigins' | 'rerouteRateLimit'>;
  places: PlacesProvider;
  weather: WeatherProvider;
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

function clientKey(req: IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

export function createApp(deps: AppDeps) {
  const limiter = new RateLimiter(deps.config.rerouteRateLimit, 60 * 60 * 1000);
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
      return { status: 200, body: { ok: true, places: deps.places.name, weather: deps.weather.name } };
    }

    if (method === 'GET' && url.pathname === '/v1/places/nearby') {
      const parsed = NearbyQuerySchema.safeParse(Object.fromEntries(url.searchParams));
      if (!parsed.success) throw new HttpError(400, 'Invalid query', formatIssues(parsed.error));
      const q = parsed.data;
      const places = await deps.places.nearby({ location: { lat: q.lat, lng: q.lng }, radiusM: q.radius, category: q.category, limit: q.limit });
      return { status: 200, body: { places } };
    }

    if (method === 'GET' && url.pathname === '/v1/weather') {
      const lat = Number(url.searchParams.get('lat'));
      const lng = Number(url.searchParams.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'lat and lng are required');
      return { status: 200, body: { hours: await deps.weather.forecast({ lat, lng }) } };
    }

    if (method === 'POST' && url.pathname === '/v1/reroute') {
      const retryAfter = limiter.hit(clientKey(req));
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

      const result = reroute({
        blocks: body.blocks,
        candidates: candidateResult.candidates,
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
          candidates: candidateResult.candidates,
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
