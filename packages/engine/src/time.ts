/** Small, dependency-free time helpers. All engine maths runs on epoch milliseconds. */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${iso}`);
  return ms;
}

export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/** Parse "HH:MM" into minutes after midnight. "24:00" → 1440. */
export function parseHm(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) throw new Error(`Invalid time: ${hm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) throw new Error(`Invalid time: ${hm}`);
  return h * 60 + min;
}

/** Local wall-clock view of an instant, given a UTC offset in minutes. */
export function localParts(ms: number, utcOffsetMinutes: number) {
  const shifted = new Date(ms + utcOffsetMinutes * MINUTE);
  return {
    day: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    /** epoch ms of local midnight at the start of this local day */
    midnight: ms - ((shifted.getUTCHours() * 60 + shifted.getUTCMinutes()) * MINUTE + shifted.getUTCSeconds() * 1000 + shifted.getUTCMilliseconds()),
  };
}

/** "4:30 PM" in the user's local time. */
export function formatClock(ms: number, utcOffsetMinutes: number): string {
  const { minutes } = localParts(ms, utcOffsetMinutes);
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function roundUpTo(ms: number, stepMinutes: number): number {
  const step = stepMinutes * MINUTE;
  return Math.ceil(ms / step) * step;
}
