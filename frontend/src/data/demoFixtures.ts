import type { Hazard, HazardStatus, HazardType } from '../services/hazardService'

/**
 * The demo dataset the browser-only build starts from.
 *
 * The public deployment runs with `VITE_IS_DEMO=true` and no backend, so without this
 * a visitor signs in successfully and lands on a completely empty map — none of the
 * duplicate detection, filtering or admin work is visible.
 *
 * **Kept in sync by hand with `backend/src/data/demoFixtures.ts`.** It cannot simply be
 * imported: Vite's root is `frontend/`, and the backend copy is a server module. A test
 * asserts the two lists agree, because two hand-maintained fixture sets otherwise drift.
 *
 * Static data only — no keys, no secrets. Everything here ships inside the public
 * bundle, which is exactly why the Gemini-backed features stay server-side.
 */

interface DemoFixture {
  type: HazardType
  latitude: number
  longitude: number
  description: string
  address: string
  status: HazardStatus
  /** Days in the past, so the lists have a believable spread rather than one timestamp. */
  daysAgo: number
}

/** Appended to every seeded description, matching the backend, so seeded rows are obvious. */
export const DEMO_MARKER = '[demo]'

const DEMO_REPORTER = {
  _id: 'demo-reporter-id',
  email: 'demo-reporter@cityscan.demo',
  name: 'Demo Reporter',
}

/**
 * Real Tel Aviv streets. The first two are deliberate: `pothole` entries roughly 25 m
 * apart on Dizengoff, inside the 50 m duplicate radius — so reporting a third pothole
 * there is rejected, and the flagship feature demonstrates itself with no setup.
 */
const FIXTURES: readonly DemoFixture[] = [
  { type: 'pothole', latitude: 32.0798, longitude: 34.7739, description: 'Deep pothole in the right lane, cars swerving to avoid it', address: 'Dizengoff St 120, Tel Aviv', status: 'open', daysAgo: 2 },
  { type: 'pothole', latitude: 32.07958, longitude: 34.7739, description: 'Second pothole a few metres further down the same stretch', address: 'Dizengoff St 118, Tel Aviv', status: 'open', daysAgo: 2 },
  { type: 'pothole', latitude: 32.0854, longitude: 34.7818, description: 'Large pothole near the bus stop, buses hitting it hard', address: 'Ibn Gabirol St 30, Tel Aviv', status: 'in_progress', daysAgo: 9 },
  { type: 'pothole', latitude: 32.0639, longitude: 34.7712, description: 'Cracked asphalt widening after the last rain', address: 'Allenby St 92, Tel Aviv', status: 'resolved', daysAgo: 26 },

  { type: 'broken_streetlight', latitude: 32.0832, longitude: 34.789, description: 'Streetlight out for over a week, the whole corner is dark at night', address: 'Weizmann St 14, Tel Aviv', status: 'open', daysAgo: 4 },
  { type: 'broken_streetlight', latitude: 32.0712, longitude: 34.7865, description: 'Light flickers constantly and buzzes loudly', address: 'Rothschild Blvd 45, Tel Aviv', status: 'in_progress', daysAgo: 12 },
  { type: 'broken_streetlight', latitude: 32.0941, longitude: 34.781, description: 'Pole leaning after a car clipped it, light hanging loose', address: 'Yehuda HaMaccabi St 52, Tel Aviv', status: 'open', daysAgo: 1 },

  { type: 'debris', latitude: 32.0673, longitude: 34.7694, description: 'Construction rubble dumped on the pavement, pedestrians walking on the road', address: 'HaCarmel St 8, Tel Aviv', status: 'open', daysAgo: 3 },
  { type: 'debris', latitude: 32.0888, longitude: 34.7748, description: 'Broken glass across the bike lane', address: 'Nordau Blvd 22, Tel Aviv', status: 'open', daysAgo: 1 },
  { type: 'debris', latitude: 32.0561, longitude: 34.7602, description: 'Fallen branch blocking half the pavement since the storm', address: 'Yerushalayim Ave 40, Jaffa', status: 'resolved', daysAgo: 31 },

  { type: 'flooding', latitude: 32.0745, longitude: 34.7798, description: 'Drain blocked, water pools across the junction after any rain', address: 'King George St 60, Tel Aviv', status: 'in_progress', daysAgo: 7 },
  { type: 'flooding', latitude: 32.1024, longitude: 34.7842, description: 'Burst pipe, water running down the street continuously', address: 'Pinkas St 33, Tel Aviv', status: 'open', daysAgo: 0 },

  { type: 'other', latitude: 32.0805, longitude: 34.7881, description: 'Pedestrian crossing markings completely worn away', address: 'Arlozorov St 88, Tel Aviv', status: 'open', daysAgo: 6 },
  { type: 'other', latitude: 32.0698, longitude: 34.7733, description: 'Bench broken with exposed metal edges, unsafe for children', address: 'Sheinkin St 25, Tel Aviv', status: 'open', daysAgo: 15 },
  { type: 'other', latitude: 32.0915, longitude: 34.7769, description: 'Manhole cover sitting loose, rattles under every car', address: 'Dizengoff St 240, Tel Aviv', status: 'resolved', daysAgo: 40 },
]

/**
 * The fixtures as `Hazard` records, keyed by id — the shape `demo_vault` stores.
 *
 * Ids are stable and derived from the index rather than generated, so a visitor's
 * deletions survive a reload: the vault records `id -> null`, and a regenerated id
 * would make the deleted hazard reappear under a new key.
 */
export function buildDemoHazards(): Record<string, Hazard> {
  const now = Date.now()
  const out: Record<string, Hazard> = {}

  FIXTURES.forEach((f, i) => {
    const id = `demo-seed-${String(i + 1).padStart(2, '0')}`
    const at = new Date(now - f.daysAgo * 24 * 60 * 60 * 1000).toISOString()

    out[id] = {
      _id: id,
      type: f.type,
      latitude: f.latitude,
      longitude: f.longitude,
      description: `${f.description} ${DEMO_MARKER}`,
      address: f.address,
      status: f.status,
      reportedBy: DEMO_REPORTER,
      createdAt: at,
      updatedAt: at,
    }
  })

  return out
}

/** Exported for the drift test against the backend fixtures. */
export const DEMO_FIXTURES = FIXTURES
