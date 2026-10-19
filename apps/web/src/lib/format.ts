import type { PlanItem, TravelMode } from '@segue/engine';

const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });

/** { time: "4:30", period: "PM" } in the device's locale/time zone. */
export function clockParts(iso: string): { time: string; period: string } {
  const parts = clockFmt.formatToParts(new Date(iso));
  const time = parts
    .filter((p) => p.type === 'hour' || p.type === 'minute' || p.type === 'literal')
    .map((p) => p.value)
    .join('')
    .trim();
  const period = parts.find((p) => p.type === 'dayPeriod')?.value.toUpperCase() ?? '';
  return { time, period };
}

export function clock(iso: string): string {
  const { time, period } = clockParts(iso);
  return period ? `${time} ${period}` : time;
}

export function longDate(d = new Date()): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 60_000);
}

export function duration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const MODE_VERB: Record<TravelMode, string> = { walk: 'walk', transit: 'by train or bus', local: 'by jeep or trike', drive: 'by car' };

export function travelLine(item: PlanItem, mode: TravelMode): string | null {
  if (!item.travelMinutesBefore) return null;
  return mode === 'walk' ? `${item.travelMinutesBefore} min walk` : `${item.travelMinutesBefore} min ${MODE_VERB[mode]}`;
}

export function directionsUrl(item: PlanItem): string | null {
  if (!item.place) return null;
  const { lat, lng } = item.place.location;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
