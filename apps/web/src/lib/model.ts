/**
 * The app's own records. Blocks are stored with wall-clock times ("13:00")
 * so they repeat day to day; they become dated engine blocks at re-route time.
 */
import type {
  Block,
  Change,
  Energy,
  LatLng,
  Place,
  PlaceCategory,
  Plan,
  Priority,
  Requirement,
  TimePref,
  TravelMode,
} from '@segue/engine';

export interface StoredBlock {
  id: string;
  title: string;
  minMinutes: number;
  maxMinutes: number;
  priority: Priority;
  category: PlaceCategory;
  requirements: Requirement[];
  /** "HH:MM" local; for meetings and classes */
  fixedStart?: string;
  fixedEnd?: string;
  fixedPlace?: string;
  earliest?: string;
  latest?: string;
  timePref?: TimePref;
  energy?: Energy;
  fallback?: string;
  /** false = paused, not planned */
  active: boolean;
}

export interface Settings {
  endOfDay: string; // "HH:MM"
  energy: Energy;
  mode: TravelMode;
  lastLocation?: LatLng;
  lastLocationLabel?: string;
  /** ISO time of the last real position fix */
  lastLocatedAt?: string;
}

export interface DayState {
  /** local date "YYYY-MM-DD" this plan belongs to */
  date: string;
  plan?: Plan;
  alternatives: Plan[];
  changes: Change[];
  doneIds: string[];
  skippedIds: string[];
  lockedIds: string[];
  generatedAt?: string;
  source?: 'server' | 'device';
  warnings: string[];
}

export interface PlaceCache {
  savedAt: string;
  location: LatLng;
  /** keyed by category so new blocks can reuse them */
  byCategory: Partial<Record<PlaceCategory, Place[]>>;
}

export const CATEGORY_LABEL: Record<PlaceCategory, string> = {
  none: 'Anywhere',
  cafe: 'Café',
  cowork: 'Coworking space',
  library: 'Library',
  restaurant: 'Place to eat',
  gym: 'Gym',
  park: 'Park',
  grocery: 'Grocery',
  mall: 'Mall',
};

export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  wifi: 'Wi-Fi',
  power: 'Power outlets',
  quiet: 'Quiet',
  outdoor: 'Outdoors',
  indoor: 'Indoors',
  food: 'Food',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  must: 'Must do',
  should: 'Should do',
  nice: 'Nice to do',
};

export const MODE_LABEL: Record<TravelMode, string> = {
  walk: 'Walking',
  transit: 'Train or bus',
  local: 'Jeep, trike or UV',
  drive: 'Car or ride-hail',
};

export const ENERGY_LABEL: Record<Energy, string> = { low: 'Low', medium: 'Okay', high: 'High' };

/** Local "YYYY-MM-DD" for a Date. */
export function localDate(d = new Date()): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export function utcOffsetMinutes(d = new Date()): number {
  return -d.getTimezoneOffset();
}

/** "13:30" today (local) → ISO with offset. */
export function todayAt(hm: string, d = new Date()): string {
  const off = utcOffsetMinutes(d);
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  const [h = '0', m = '0'] = hm.split(':');
  return `${localDate(d)}T${h.padStart(2, '0')}:${m.padStart(2, '0')}:00${tz}`;
}

export function toEngineBlock(b: StoredBlock, now = new Date()): Block {
  const block: Block = {
    id: b.id,
    title: b.title,
    minMinutes: b.minMinutes,
    maxMinutes: Math.max(b.minMinutes, b.maxMinutes),
    priority: b.priority,
    category: b.category,
    requirements: b.requirements,
    timePref: b.timePref,
    energy: b.energy,
    fallback: b.fallback,
  };
  if (b.fixedStart && b.fixedEnd) {
    block.fixed = { start: todayAt(b.fixedStart, now), end: todayAt(b.fixedEnd, now), placeName: b.fixedPlace };
    block.category = 'none';
    block.requirements = [];
  }
  if (b.earliest) block.earliest = todayAt(b.earliest, now);
  if (b.latest) block.latest = todayAt(b.latest, now);
  return block;
}

export function newId(prefix = 'b'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

export function emptyDay(date = localDate()): DayState {
  return { date, alternatives: [], changes: [], doneIds: [], skippedIds: [], lockedIds: [], warnings: [] };
}
