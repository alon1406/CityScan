/**
 * Seeds realistic demo data so the map is not blank on first view.
 *
 *   npm run seed:demo              development — runs freely
 *   npm run seed:demo -- --force   production  — requires explicit intent
 *
 * This is the equivalent of SmartCollect's `SmartCollectDemoInit implements
 * CommandLineRunner` behind `@Profile("initDemoes")`: run once to populate a fresh
 * database, then leave it alone.
 *
 * It exists because an empty database hides all the work. Without it an interviewer
 * clicks "Sign in as Admin", authenticates successfully, and lands on a blank map —
 * duplicate detection, the admin panel and the status filters all need data before
 * they demonstrate anything.
 *
 * Idempotent: re-running replaces the seeded hazards rather than duplicating them,
 * and never touches hazards reported by real users.
 */
import '../config/loadEnv.js'; // MUST be first — see server.ts.

import bcrypt from 'bcrypt';
import { config } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Hazard } from '../data/hazard.entity.js';
import { User } from '../data/user.entity.js';
import type { HazardStatus, HazardType } from '../data/enums.js';

/** Marks rows created by this script, so re-runs and cleanup can find them. */
const SEED_MARKER = '[demo]';
const SEED_REPORTER_EMAIL = 'demo-reporter@cityscan.demo';

interface SeedHazard {
  type: HazardType;
  latitude: number;
  longitude: number;
  description: string;
  address: string;
  status: HazardStatus;
  /** Days in the past, so the list has a believable spread rather than one timestamp. */
  daysAgo: number;
}

/**
 * Real Tel Aviv streets, spread widely enough that most are independent reports.
 *
 * The pair at Dizengoff is deliberate: two `pothole` entries roughly 25 m apart.
 * That is inside the 50 m duplicate radius, so it both proves the geo query works on
 * seeded data and gives a live demo — reporting a third pothole there returns 409.
 */
const HAZARDS: SeedHazard[] = [
  // --- The duplicate-detection pair (Dizengoff, ~25 m apart) ---
  {
    type: 'pothole',
    latitude: 32.07980,
    longitude: 34.77390,
    description: 'Deep pothole in the right lane, cars swerving to avoid it',
    address: 'Dizengoff St 120, Tel Aviv',
    status: 'open',
    daysAgo: 2,
  },
  {
    type: 'pothole',
    latitude: 32.07958,
    longitude: 34.77390,
    description: 'Second pothole a few metres further down the same stretch',
    address: 'Dizengoff St 118, Tel Aviv',
    status: 'open',
    daysAgo: 2,
  },

  // --- Potholes ---
  {
    type: 'pothole',
    latitude: 32.08540,
    longitude: 34.78180,
    description: 'Large pothole near the bus stop, buses hitting it hard',
    address: 'Ibn Gabirol St 30, Tel Aviv',
    status: 'in_progress',
    daysAgo: 9,
  },
  {
    type: 'pothole',
    latitude: 32.06390,
    longitude: 34.77120,
    description: 'Cracked asphalt widening after the last rain',
    address: 'Allenby St 92, Tel Aviv',
    status: 'resolved',
    daysAgo: 26,
  },

  // --- Broken streetlights ---
  {
    type: 'broken_streetlight',
    latitude: 32.08320,
    longitude: 34.78900,
    description: 'Streetlight out for over a week, the whole corner is dark at night',
    address: 'Weizmann St 14, Tel Aviv',
    status: 'open',
    daysAgo: 4,
  },
  {
    type: 'broken_streetlight',
    latitude: 32.07120,
    longitude: 34.78650,
    description: 'Light flickers constantly and buzzes loudly',
    address: 'Rothschild Blvd 45, Tel Aviv',
    status: 'in_progress',
    daysAgo: 12,
  },
  {
    type: 'broken_streetlight',
    latitude: 32.09410,
    longitude: 34.78100,
    description: 'Pole leaning after a car clipped it, light hanging loose',
    address: 'Yehuda HaMaccabi St 52, Tel Aviv',
    status: 'open',
    daysAgo: 1,
  },

  // --- Debris ---
  {
    type: 'debris',
    latitude: 32.06730,
    longitude: 34.76940,
    description: 'Construction rubble dumped on the pavement, pedestrians walking on the road',
    address: 'HaCarmel St 8, Tel Aviv',
    status: 'open',
    daysAgo: 3,
  },
  {
    type: 'debris',
    latitude: 32.08880,
    longitude: 34.77480,
    description: 'Broken glass across the bike lane',
    address: 'Nordau Blvd 22, Tel Aviv',
    status: 'open',
    daysAgo: 1,
  },
  {
    type: 'debris',
    latitude: 32.05610,
    longitude: 34.76020,
    description: 'Fallen branch blocking half the pavement since the storm',
    address: 'Yerushalayim Ave 40, Jaffa',
    status: 'resolved',
    daysAgo: 31,
  },

  // --- Flooding ---
  {
    type: 'flooding',
    latitude: 32.07450,
    longitude: 34.77980,
    description: 'Drain blocked, water pools across the junction after any rain',
    address: 'King George St 60, Tel Aviv',
    status: 'in_progress',
    daysAgo: 7,
  },
  {
    type: 'flooding',
    latitude: 32.10240,
    longitude: 34.78420,
    description: 'Burst pipe, water running down the street continuously',
    address: 'Pinkas St 33, Tel Aviv',
    status: 'open',
    daysAgo: 0,
  },

  // --- Other ---
  {
    type: 'other',
    latitude: 32.08050,
    longitude: 34.78810,
    description: 'Pedestrian crossing markings completely worn away',
    address: 'Arlozorov St 88, Tel Aviv',
    status: 'open',
    daysAgo: 6,
  },
  {
    type: 'other',
    latitude: 32.06980,
    longitude: 34.77330,
    description: 'Bench broken with exposed metal edges, unsafe for children',
    address: 'Sheinkin St 25, Tel Aviv',
    status: 'open',
    daysAgo: 15,
  },
  {
    type: 'other',
    latitude: 32.09150,
    longitude: 34.77690,
    description: 'Manhole cover sitting loose, rattles under every car',
    address: 'Dizengoff St 240, Tel Aviv',
    status: 'resolved',
    daysAgo: 40,
  },
];

async function seed(): Promise<void> {
  const force = process.argv.includes('--force');

  if (config.isProduction && !force) {
    console.error(
      '\n Refusing to seed the production profile.\n' +
        '   Demo data does not belong in a real deployment.\n' +
        '   If this is the portfolio deployment and you mean it, re-run with --force.\n'
    );
    process.exit(1);
  }

  await connectDB();

  if (config.isProduction) {
    console.warn('  Seeding PRODUCTION because --force was given.\n');
  }

  // A dedicated author, so seeded rows are always distinguishable from real reports.
  let reporter = await User.findOne({ email: SEED_REPORTER_EMAIL }).exec();
  if (!reporter) {
    reporter = await User.create({
      email: SEED_REPORTER_EMAIL,
      password: await bcrypt.hash(config.demo.password, 10),
      name: 'Demo Reporter',
      role: 'user',
    });
    console.log(`Created seed reporter: ${SEED_REPORTER_EMAIL}`);
  }

  // Idempotency: clear only what this script created, never a real user's report.
  const removed = await Hazard.deleteMany({ reportedBy: reporter._id }).exec();
  if (removed.deletedCount > 0) {
    console.log(`Removed ${removed.deletedCount} previously seeded hazard(s).`);
  }

  const now = Date.now();
  let created = 0;

  for (const h of HAZARDS) {
    const doc = new Hazard({
      type: h.type,
      latitude: h.latitude,
      longitude: h.longitude,
      description: `${h.description} ${SEED_MARKER}`,
      address: h.address,
      status: h.status,
      reportedBy: reporter._id,
    });

    // .save() so the pre-save hook builds the GeoJSON `location` the 2dsphere index needs.
    await doc.save();

    // Backdate afterwards, because `timestamps: true` stamps createdAt on insert.
    //
    // Deliberately the native driver collection rather than `Hazard.updateOne`.
    // Mongoose reasserts its automatic timestamps over anything set through the model —
    // `{ timestamps: false }` on the update did not stop it either — so every seeded row
    // silently ended up dated "now" and the admin list showed fifteen identical dates.
    // `Model.collection` bypasses Mongoose middleware entirely.
    const createdAt = new Date(now - h.daysAgo * 24 * 60 * 60 * 1000);
    await Hazard.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt, updatedAt: createdAt } }
    );

    created += 1;
  }

  const byStatus = await Hazard.aggregate<{ _id: string; n: number }>([
    { $group: { _id: '$status', n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  console.log(`\nSeeded ${created} hazards into "${config.db.name}" (profile: ${config.profile}).`);
  for (const s of byStatus) console.log(`   ${s._id.padEnd(12)} ${s.n}`);
  console.log(
    '\nTwo potholes sit ~25 m apart on Dizengoff — report a third one there to see the 409.\n'
  );

  await disconnectDB();
}

seed().catch(async (err: unknown) => {
  console.error('Seeding failed:', err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
