import type { Settings, StoredBlock } from './model';

/** A starter day so the first open shows something real, not an empty screen. */
export const SEED_BLOCKS: StoredBlock[] = [
  {
    id: 'seed_deep_work',
    title: 'Deep work',
    minMinutes: 90,
    maxMinutes: 120,
    priority: 'must',
    category: 'cafe',
    requirements: ['wifi', 'power'],
    energy: 'high',
    fallback: 'Offline tasks wherever you are',
    active: true,
  },
  {
    id: 'seed_lunch',
    title: 'Lunch',
    minMinutes: 30,
    maxMinutes: 45,
    priority: 'should',
    category: 'restaurant',
    requirements: [],
    earliest: '11:00',
    latest: '14:30',
    fallback: 'Grab something to go',
    active: true,
  },
  {
    id: 'seed_gym',
    title: 'Gym',
    minMinutes: 45,
    maxMinutes: 60,
    priority: 'should',
    category: 'gym',
    requirements: [],
    energy: 'high',
    fallback: 'Bodyweight workout where you are',
    active: true,
  },
  {
    id: 'seed_groceries',
    title: 'Groceries',
    minMinutes: 20,
    maxMinutes: 30,
    priority: 'nice',
    category: 'grocery',
    requirements: [],
    timePref: 'evening',
    fallback: 'Order delivery',
    active: true,
  },
  {
    id: 'seed_call',
    title: 'Call family',
    minMinutes: 20,
    maxMinutes: 30,
    priority: 'nice',
    category: 'none',
    requirements: [],
    timePref: 'evening',
    active: true,
  },
];

export const DEFAULT_SETTINGS: Settings = {
  endOfDay: '22:00',
  energy: 'medium',
  mode: 'local',
};

/**
 * Last resort for planning only, when there's no position, no saved fix and the
 * time zone points nowhere (Metro Manila). Never used for the sky: with nothing
 * to go on, the sky makes no weather claim.
 */
export const DEFAULT_LOCATION = { lat: 14.5995, lng: 120.9842 };
