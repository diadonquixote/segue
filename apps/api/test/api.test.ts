import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockPlacesProvider, type WeatherProvider } from '@segue/providers';
import { createApp } from '../src/app';

const weather: WeatherProvider = {
  name: 'fake',
  forecast: async () => [{ time: '2026-10-19T06:00:00Z', precipitationProbability: 10 }],
};

const ctx = {
  now: '2026-10-19T14:00:00+08:00',
  endOfDay: '2026-10-19T22:00:00+08:00',
  location: { lat: 14.5995, lng: 120.9842 },
  energy: 'medium',
  mode: 'walk',
  utcOffsetMinutes: 480,
};
const blocks = [
  { id: 'work', title: 'Deep work', minMinutes: 60, maxMinutes: 90, priority: 'must', category: 'cafe', requirements: ['wifi'] },
  { id: 'gym', title: 'Gym', minMinutes: 45, maxMinutes: 60, priority: 'should', category: 'gym', requirements: [], fallback: 'Home workout' },
  { id: 'call', title: 'Call family', minMinutes: 20, maxMinutes: 30, priority: 'nice', category: 'none', requirements: [] },
];

let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer(
    createApp({
      config: { corsOrigins: ['http://localhost:5173'], rerouteRateLimit: 5 },
      places: new MockPlacesProvider(),
      weather,
      log: () => {},
    }),
  );
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('API', () => {
  it('reports health', async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, places: 'mock', weather: 'fake' });
  });

  it('re-routes a day and returns the plan, alternatives, and candidates', async () => {
    const res = await post('/v1/reroute', { blocks, context: ctx }, { 'x-forwarded-for': '10.0.0.1' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      plan: { items: { blockId: string; place?: { id: string } }[]; unscheduled: unknown[] };
      candidates: Record<string, unknown[]>;
      meta: { placesProvider: string; weather: boolean };
    };
    expect(body.plan.items.map((i) => i.blockId).sort()).toEqual(['call', 'gym', 'work']);
    expect(body.plan.items.find((i) => i.blockId === 'work')?.place?.id).toMatch(/^mock:/);
    expect(Object.keys(body.candidates).sort()).toEqual(['gym', 'work']);
    expect(body.meta).toMatchObject({ placesProvider: 'mock', weather: true });
  });

  it('uses client-supplied candidates when given (offline cache)', async () => {
    const candidates = {
      work: [{ id: 'mine', name: 'My Café', location: ctx.location, category: 'cafe', attributes: { wifi: true }, hours: null, source: 'client' }],
    };
    const res = await post('/v1/reroute', { blocks: [blocks[0]], context: ctx, candidates }, { 'x-forwarded-for': '10.0.0.2' });
    const body = (await res.json()) as { plan: { items: { place?: { id: string } }[] }; meta: { placesProvider: string } };
    expect(body.plan.items[0]?.place?.id).toBe('mine');
    expect(body.meta.placesProvider).toBe('client');
  });

  it('rejects invalid requests with readable details', async () => {
    const res = await post('/v1/reroute', { blocks: [{ ...blocks[0], maxMinutes: 10 }], context: ctx }, { 'x-forwarded-for': '10.0.0.3' });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: string[] };
    expect(body.details.join(' ')).toMatch(/maxMinutes/);
  });

  it('rejects non-JSON bodies', async () => {
    const res = await fetch(`${base}/v1/reroute`, { method: 'POST', body: 'not json', headers: { 'x-forwarded-for': '10.0.0.4' } });
    expect(res.status).toBe(400);
  });

  it('rate-limits re-routes per client', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await post('/v1/reroute', { blocks: [blocks[2]], context: ctx }, { 'x-forwarded-for': '10.0.0.9' });
      statuses.push(res.status);
      await res.arrayBuffer();
    }
    expect(statuses.slice(0, 5).every((s) => s === 200)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it('serves nearby places with validated queries', async () => {
    const ok = await fetch(`${base}/v1/places/nearby?lat=14.6&lng=121&category=gym`);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { places: unknown[] }).places.length).toBeGreaterThan(0);
    const bad = await fetch(`${base}/v1/places/nearby?lat=14.6&lng=121&category=spaceport`);
    expect(bad.status).toBe(400);
  });

  it('answers CORS preflight only for allowed origins', async () => {
    const allowed = await fetch(`${base}/v1/reroute`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173' } });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const denied = await fetch(`${base}/v1/reroute`, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('returns 404 for unknown routes', async () => {
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
