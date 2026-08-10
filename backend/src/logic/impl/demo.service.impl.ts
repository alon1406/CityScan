import bcrypt from 'bcrypt';
import type { DemoService, DemoResetSummary } from '../demo.service.js';
import type { PhotoStorageService } from '../photoStorage.service.js';
import type { EventsService } from '../events.service.js';
import { Hazard } from '../../data/hazard.entity.js';
import { User } from '../../data/user.entity.js';
import { DEMO_HAZARDS, DEMO_MARKER, DEMO_REPORTER_EMAIL } from '../../data/demoFixtures.js';
import { config } from '../../config/env.js';

const BCRYPT_ROUNDS = 10;

/** Accounts the demo owns. Everything else is a visitor and gets cleared. */
function demoOwnedEmails(): string[] {
  return [DEMO_REPORTER_EMAIL, config.demo.adminEmail, config.demo.userEmail];
}

export class DemoServiceImpl implements DemoService {
  constructor(
    private readonly photos: PhotoStorageService,
    private readonly events: EventsService
  ) {}

  async resetToSeed(): Promise<DemoResetSummary> {
    const startedAt = Date.now();

    // 1. Collect photo references before deleting the rows. Deleting the documents
    //    first would orphan the files on disk with nothing left pointing at them —
    //    which on a small VPS is how a disk quietly fills over months.
    const withPhotos = await Hazard.find({ hazardPhotos: { $exists: true, $ne: [] } })
      .select('hazardPhotos')
      .lean<{ hazardPhotos?: string[] }[]>()
      .exec();
    const photoRefs = withPhotos.flatMap((h) => h.hazardPhotos ?? []);

    // 2. Everything a visitor could have created, edited or deleted.
    const removedHazards = await Hazard.deleteMany({}).exec();
    await this.photos.removeMany(photoRefs);

    // 3. Visitor accounts. The demo's own accounts survive so the guest login keeps
    //    working; a visitor who registered leaves nothing behind.
    const removedUsers = await User.deleteMany({
      email: { $nin: demoOwnedEmails() },
    }).exec();

    // 4. Re-seed the canonical fixtures.
    const seeded = await this.seedFixtures();

    // 5. Tell any connected map to refetch — otherwise open tabs keep showing hazards
    //    that no longer exist, with ids that now 404.
    this.events.emit({
      type: 'hazard:deleted',
      hazard: { _id: '*' },
      at: new Date().toISOString(),
    });

    return {
      hazardsRemoved: removedHazards.deletedCount ?? 0,
      photosRemoved: photoRefs.length,
      usersRemoved: removedUsers.deletedCount ?? 0,
      hazardsSeeded: seeded,
      durationMs: Date.now() - startedAt,
    };
  }

  private async seedFixtures(): Promise<number> {
    let reporter = await User.findOne({ email: DEMO_REPORTER_EMAIL }).exec();
    if (!reporter) {
      reporter = await User.create({
        email: DEMO_REPORTER_EMAIL,
        password: await bcrypt.hash(config.demo.password, BCRYPT_ROUNDS),
        name: 'Demo Reporter',
        role: 'user',
      });
    }

    const now = Date.now();

    for (const fixture of DEMO_HAZARDS) {
      const doc = new Hazard({
        type: fixture.type,
        latitude: fixture.latitude,
        longitude: fixture.longitude,
        description: `${fixture.description} ${DEMO_MARKER}`,
        address: fixture.address,
        status: fixture.status,
        reportedBy: reporter._id,
      });

      // .save() so the pre-save hook builds the GeoJSON `location` the 2dsphere
      // index needs — an atomic update would bypass it and break the radius queries.
      await doc.save();

      // Backdate through the native driver on purpose. Mongoose reasserts its own
      // automatic timestamps over anything written through the model, and even
      // `{ timestamps: false }` on the update does not stop it, so every row would
      // otherwise end up dated "now".
      const createdAt = new Date(now - fixture.daysAgo * 24 * 60 * 60 * 1000);
      await Hazard.collection.updateOne(
        { _id: doc._id },
        { $set: { createdAt, updatedAt: createdAt } }
      );
    }

    return DEMO_HAZARDS.length;
  }
}
