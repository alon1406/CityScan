/**
 * Resets the database to the canonical demo state.
 *
 *   npm run seed:demo              development — runs freely
 *   npm run seed:demo -- --force   production  — requires explicit intent
 *
 * This is the equivalent of SmartCollect's `SmartCollectDemoInit implements
 * CommandLineRunner` behind `@Profile("initDemoes")`.
 *
 * The logic itself lives in `logic/impl/demo.service.impl.ts`, not here: the scheduled
 * reset endpoint that n8n calls nightly needs exactly the same behaviour, and two
 * copies of "wipe the database and re-seed" would inevitably drift apart.
 */
import '../config/loadEnv.js'; // MUST be first — see server.ts.

import { config } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { createContainer } from '../container.js';

async function main(): Promise<void> {
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

  const { demo } = createContainer();
  const s = await demo.resetToSeed();

  console.log(`\nReset "${config.db.name}" to the seeded state (profile: ${config.profile}).`);
  console.log(`   removed  ${s.hazardsRemoved} hazards, ${s.photosRemoved} photos, ${s.usersRemoved} visitor accounts`);
  console.log(`   seeded   ${s.hazardsSeeded} hazards in ${s.durationMs}ms`);
  console.log(
    '\nTwo potholes sit ~25 m apart on Dizengoff — report a third one there to see the 409.\n'
  );

  await disconnectDB();
}

main().catch(async (err: unknown) => {
  console.error('Seeding failed:', err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
