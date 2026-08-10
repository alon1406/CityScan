/**
 * One-off script: delete every hazard report and its stored photos.
 *
 * Run from the backend folder:  npm run clear-reports
 *
 * Note the first import — same rule as `server.ts`. This script used to call
 * `dotenv.config()` in its body, which under ESM runs after every import has already
 * been evaluated, so `config` would have been built from an empty environment.
 */
import '../config/loadEnv.js'; // MUST be first.

import { config } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Hazard } from '../data/hazard.entity.js';
import { LocalDiskPhotoStorageImpl } from '../logic/impl/localDisk.photoStorage.impl.js';

async function clearReports(): Promise<void> {
  if (config.isProduction) {
    console.error(' Refusing to run against the production profile.');
    process.exit(1);
  }

  await connectDB();

  // Collect photo paths before deleting the rows, otherwise the files are orphaned
  // on disk with nothing left pointing at them.
  const photos = await Hazard.find({ hazardPhotos: { $exists: true, $ne: [] } })
    .select('hazardPhotos')
    .lean<{ hazardPhotos?: string[] }[]>()
    .exec();

  const result = await Hazard.deleteMany({});

  const storage = new LocalDiskPhotoStorageImpl();
  const refs = photos.flatMap((h) => h.hazardPhotos ?? []);
  await storage.removeMany(refs);

  console.log(
    `Cleared ${result.deletedCount} report(s) and ${refs.length} photo file(s) from profile "${config.profile}".`
  );

  await disconnectDB();
}

clearReports().catch((err: unknown) => {
  console.error('Error clearing reports:', err);
  process.exit(1);
});
