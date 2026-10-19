import type { Block, Context, OpeningHours, Place } from '../src';

export const MANILA = { lat: 14.5995, lng: 120.9842 };
export const TZ = 480; // UTC+8

/** Offset a coordinate by meters (north, east). */
export function near(dNorthM: number, dEastM: number, base = MANILA) {
  return {
    lat: base.lat + dNorthM / 111_320,
    lng: base.lng + dEastM / (111_320 * Math.cos((base.lat * Math.PI) / 180)),
  };
}

export const everyDay = (open: string, close: string): OpeningHours => ({
  periods: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open, close })),
});

/** Monday 19 Oct 2026, local Manila time "HH:MM" → ISO. */
export const at = (hm: string) => `2026-10-19T${hm}:00+08:00`;

export function context(overrides: Partial<Context> = {}): Context {
  return {
    now: at('14:00'),
    endOfDay: at('22:00'),
    location: MANILA,
    energy: 'medium',
    mode: 'walk',
    utcOffsetMinutes: TZ,
    ...overrides,
  };
}

export const places = {
  cafeGood: {
    id: 'cafe-good',
    name: 'Kape Hub',
    location: near(300, 200),
    category: 'cafe',
    attributes: { wifi: true, power: true },
    hours: everyDay('07:00', '22:00'),
    rating: 4.6,
    reviewCount: 420,
    source: 'test',
  },
  cafeNoWifi: {
    id: 'cafe-nowifi',
    name: 'Quiet Beans',
    location: near(100, 50),
    category: 'cafe',
    attributes: { wifi: false },
    hours: everyDay('07:00', '22:00'),
    rating: 4.8,
    reviewCount: 900,
    source: 'test',
  },
  cafeFar: {
    id: 'cafe-far',
    name: 'Far Brew',
    location: near(1200, -900),
    category: 'cafe',
    attributes: { wifi: true },
    hours: everyDay('06:00', '23:00'),
    rating: 4.2,
    reviewCount: 80,
    source: 'test',
  },
  diner: {
    id: 'diner',
    name: 'Lutong Bahay',
    location: near(-200, 150),
    category: 'restaurant',
    attributes: {},
    hours: everyDay('10:00', '21:00'),
    rating: 4.4,
    reviewCount: 300,
    source: 'test',
  },
  gymClosesEarly: {
    id: 'gym-early',
    name: 'Iron Box',
    location: near(400, -300),
    category: 'gym',
    attributes: {},
    hours: everyDay('06:00', '15:00'),
    rating: 4.5,
    reviewCount: 150,
    source: 'test',
  },
  gymLate: {
    id: 'gym-late',
    name: 'Night Lift',
    location: near(-600, 500),
    category: 'gym',
    attributes: {},
    hours: everyDay('16:00', '23:00'),
    rating: 4.1,
    reviewCount: 60,
    source: 'test',
  },
  park: {
    id: 'park',
    name: 'Rizal Park',
    location: near(-300, -400),
    category: 'park',
    attributes: { outdoor: true },
    hours: { always: true, periods: [] },
    source: 'test',
  },
} satisfies Record<string, Place>;

export const blocks = {
  deepWork: {
    id: 'deep-work',
    title: 'Deep work',
    minMinutes: 90,
    maxMinutes: 120,
    priority: 'must',
    category: 'cafe',
    requirements: ['wifi'],
    energy: 'high',
  },
  dinner: {
    id: 'dinner',
    title: 'Dinner',
    minMinutes: 45,
    maxMinutes: 60,
    priority: 'should',
    category: 'restaurant',
    requirements: [],
    earliest: at('17:30'),
    latest: at('20:30'),
  },
  gym: {
    id: 'gym',
    title: 'Gym',
    minMinutes: 45,
    maxMinutes: 60,
    priority: 'should',
    category: 'gym',
    requirements: [],
    fallback: 'Bodyweight workout at home',
  },
  call: {
    id: 'call',
    title: 'Call family',
    minMinutes: 20,
    maxMinutes: 30,
    priority: 'nice',
    category: 'none',
    requirements: [],
  },
  walk: {
    id: 'walk',
    title: 'Evening walk',
    minMinutes: 30,
    maxMinutes: 45,
    priority: 'nice',
    category: 'park',
    requirements: ['outdoor'],
    fallback: 'Stretch indoors',
  },
  meeting: {
    id: 'meeting',
    title: 'Org meeting',
    minMinutes: 60,
    maxMinutes: 60,
    priority: 'must',
    category: 'none',
    requirements: [],
    fixed: { start: at('17:00'), end: at('18:00'), location: near(0, 0), placeName: 'Student center' },
  },
} satisfies Record<string, Block>;
