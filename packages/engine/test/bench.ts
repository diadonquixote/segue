/**
 * Rough performance check: a busy day with many blocks and candidates.
 * Run: pnpm --filter @segue/engine bench
 */
import { reroute, type Block, type Place } from '../src';
import { at, context, everyDay, near } from './fixtures';

const places: Place[] = Array.from({ length: 40 }, (_, i) => ({
  id: `p${i}`,
  name: `Place ${i}`,
  location: near(((i * 137) % 3000) - 1500, ((i * 251) % 3000) - 1500),
  category: 'cafe',
  attributes: { wifi: i % 4 !== 0 },
  hours: i % 5 === 0 ? null : everyDay(`${String(6 + (i % 5)).padStart(2, '0')}:00`, `${18 + (i % 5)}:00`),
  rating: 3.5 + (i % 15) / 10,
  reviewCount: 10 + i * 13,
  source: 'bench',
}));

const blocks: Block[] = Array.from({ length: 12 }, (_, i) => ({
  id: `b${i}`,
  title: `Block ${i}`,
  minMinutes: 20 + (i % 4) * 10,
  maxMinutes: 40 + (i % 4) * 15,
  priority: (['must', 'should', 'nice'] as const)[i % 3]!,
  category: i % 3 === 2 ? 'none' : 'cafe',
  requirements: i % 2 ? ['wifi'] : [],
}));

const candidates = Object.fromEntries(blocks.map((b) => [b.id, places]));
const runs = 5;
const t0 = performance.now();
let last;
for (let i = 0; i < runs; i++) last = reroute({ blocks, candidates, context: context({ now: at('08:00'), mode: 'transit' }) });
const ms = (performance.now() - t0) / runs;
console.log(`reroute: ${ms.toFixed(0)} ms avg over ${runs} runs · ${last!.plan.items.length} scheduled, ${last!.plan.unscheduled.length} unscheduled`);
