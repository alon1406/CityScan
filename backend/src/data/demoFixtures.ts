import type { HazardStatus, HazardType } from './enums.js';

/**
 * The canonical demo dataset — the state the public deployment returns to.
 *
 * Kept beside the entities rather than inside a script because it is data, and because
 * both the CLI seeder and the scheduled reset endpoint read it.
 */
export interface DemoHazardFixture {
  type: HazardType;
  latitude: number;
  longitude: number;
  description: string;
  address: string;
  status: HazardStatus;
  /** Days in the past, so the lists have a believable spread rather than one timestamp. */
  daysAgo: number;
}

/** Appended to every seeded description, so seeded rows are identifiable at a glance. */
export const DEMO_MARKER = '[demo]';

/** The account that authors every seeded hazard. */
export const DEMO_REPORTER_EMAIL = 'demo-reporter@cityscan.demo';

/**
 * Real Tel Aviv streets, spread widely enough that most read as independent reports.
 *
 * The first two are deliberate: `pothole` entries roughly 25 m apart on Dizengoff.
 * That is inside the 50 m duplicate radius, so reporting a third pothole there returns
 * 409 on demand — the duplicate detection can be demonstrated live without setup.
 */
export const DEMO_HAZARDS: readonly DemoHazardFixture[] = [
  // --- The duplicate-detection pair (~25 m apart) ---
  {
    type: 'pothole',
    latitude: 32.0798,
    longitude: 34.7739,
    description: 'Deep pothole in the right lane, cars swerving to avoid it',
    address: 'Dizengoff St 120, Tel Aviv',
    status: 'open',
    daysAgo: 2,
  },
  {
    type: 'pothole',
    latitude: 32.07958,
    longitude: 34.7739,
    description: 'Second pothole a few metres further down the same stretch',
    address: 'Dizengoff St 118, Tel Aviv',
    status: 'open',
    daysAgo: 2,
  },

  // --- Potholes ---
  {
    type: 'pothole',
    latitude: 32.0854,
    longitude: 34.7818,
    description: 'Large pothole near the bus stop, buses hitting it hard',
    address: 'Ibn Gabirol St 30, Tel Aviv',
    status: 'in_progress',
    daysAgo: 9,
  },
  {
    type: 'pothole',
    latitude: 32.0639,
    longitude: 34.7712,
    description: 'Cracked asphalt widening after the last rain',
    address: 'Allenby St 92, Tel Aviv',
    status: 'resolved',
    daysAgo: 26,
  },

  // --- Broken streetlights ---
  {
    type: 'broken_streetlight',
    latitude: 32.0832,
    longitude: 34.789,
    description: 'Streetlight out for over a week, the whole corner is dark at night',
    address: 'Weizmann St 14, Tel Aviv',
    status: 'open',
    daysAgo: 4,
  },
  {
    type: 'broken_streetlight',
    latitude: 32.0712,
    longitude: 34.7865,
    description: 'Light flickers constantly and buzzes loudly',
    address: 'Rothschild Blvd 45, Tel Aviv',
    status: 'in_progress',
    daysAgo: 12,
  },
  {
    type: 'broken_streetlight',
    latitude: 32.0941,
    longitude: 34.781,
    description: 'Pole leaning after a car clipped it, light hanging loose',
    address: 'Yehuda HaMaccabi St 52, Tel Aviv',
    status: 'open',
    daysAgo: 1,
  },

  // --- Debris ---
  {
    type: 'debris',
    latitude: 32.0673,
    longitude: 34.7694,
    description: 'Construction rubble dumped on the pavement, pedestrians walking on the road',
    address: 'HaCarmel St 8, Tel Aviv',
    status: 'open',
    daysAgo: 3,
  },
  {
    type: 'debris',
    latitude: 32.0888,
    longitude: 34.7748,
    description: 'Broken glass across the bike lane',
    address: 'Nordau Blvd 22, Tel Aviv',
    status: 'open',
    daysAgo: 1,
  },
  {
    type: 'debris',
    latitude: 32.0561,
    longitude: 34.7602,
    description: 'Fallen branch blocking half the pavement since the storm',
    address: 'Yerushalayim Ave 40, Jaffa',
    status: 'resolved',
    daysAgo: 31,
  },

  // --- Flooding ---
  {
    type: 'flooding',
    latitude: 32.0745,
    longitude: 34.7798,
    description: 'Drain blocked, water pools across the junction after any rain',
    address: 'King George St 60, Tel Aviv',
    status: 'in_progress',
    daysAgo: 7,
  },
  {
    type: 'flooding',
    latitude: 32.1024,
    longitude: 34.7842,
    description: 'Burst pipe, water running down the street continuously',
    address: 'Pinkas St 33, Tel Aviv',
    status: 'open',
    daysAgo: 0,
  },

  // --- Other ---
  {
    type: 'other',
    latitude: 32.0805,
    longitude: 34.7881,
    description: 'Pedestrian crossing markings completely worn away',
    address: 'Arlozorov St 88, Tel Aviv',
    status: 'open',
    daysAgo: 6,
  },
  {
    type: 'other',
    latitude: 32.0698,
    longitude: 34.7733,
    description: 'Bench broken with exposed metal edges, unsafe for children',
    address: 'Sheinkin St 25, Tel Aviv',
    status: 'open',
    daysAgo: 15,
  },
  {
    type: 'other',
    latitude: 32.0915,
    longitude: 34.7769,
    description: 'Manhole cover sitting loose, rattles under every car',
    address: 'Dizengoff St 240, Tel Aviv',
    status: 'resolved',
    daysAgo: 40,
  },
];
