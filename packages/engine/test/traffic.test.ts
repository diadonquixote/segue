import { describe, expect, it } from 'vitest';
import { estimateTravelMinutes, rushHourFactor, trafficAware } from '../src/geo';
import { reroute } from '../src/reroute';

const MANILA = 480;
const at = (iso: string) => Date.parse(iso);
const home = { lat: 14.5547, lng: 121.0244 };
const office = { lat: 14.5995, lng: 120.9842 }; // ~7 km away

describe('rush hour', () => {
  it('slows weekday rush hours only', () => {
    expect(rushHourFactor(at('2026-10-19T08:30:00+08:00'), MANILA)).toBe(1.5); // Monday morning
    expect(rushHourFactor(at('2026-10-19T18:00:00+08:00'), MANILA)).toBe(1.5);
    expect(rushHourFactor(at('2026-10-19T13:00:00+08:00'), MANILA)).toBe(1);
    expect(rushHourFactor(at('2026-10-18T08:30:00+08:00'), MANILA)).toBe(1); // Sunday
  });

  it('makes rides longer at rush hour but never walks', () => {
    const travel = trafficAware(estimateTravelMinutes, MANILA);
    const calm = travel(home, office, 'drive', at('2026-10-19T13:00:00+08:00'));
    const rush = travel(home, office, 'drive', at('2026-10-19T08:00:00+08:00'));
    expect(rush).toBeGreaterThan(calm);
    expect(travel(home, office, 'walk', at('2026-10-19T08:00:00+08:00'))).toBe(estimateTravelMinutes(home, office, 'walk'));
    expect(travel(home, office, 'drive')).toBe(estimateTravelMinutes(home, office, 'drive'));
  });

  it('is used by default when planning', () => {
    const travelBefore = (now: string, start: string, end: string) =>
      reroute({
        blocks: [
          { id: 'mtg', title: 'Meeting', minMinutes: 30, maxMinutes: 30, priority: 'must', category: 'none', requirements: [], fixed: { start, end, location: office } },
        ],
        candidates: {},
        context: { now, endOfDay: '2026-10-19T23:00:00+08:00', location: home, energy: 'medium', mode: 'drive', utcOffsetMinutes: MANILA },
      }).plan.items[0]!.travelMinutesBefore;
    const rush = travelBefore('2026-10-19T08:00:00+08:00', '2026-10-19T10:00:00+08:00', '2026-10-19T10:30:00+08:00');
    const calm = travelBefore('2026-10-19T12:00:00+08:00', '2026-10-19T14:00:00+08:00', '2026-10-19T14:30:00+08:00');
    expect(rush).toBeGreaterThan(calm);
  });
});
