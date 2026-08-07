import type { QueryFilter, Types } from 'mongoose';
import { Hazard, type HazardEntity } from '../data/hazard.entity.js';
import { UNRESOLVED_STATUSES, type HazardStatus, type HazardType } from '../data/enums.js';

/**
 * All hazard queries live here.
 *
 * This is the layer SmartCollect expresses as `ObjectRepository extends JpaRepository`
 * with `findAllByLocationSquare(@Param("minLat") …)`. The point is the same: a service
 * asks for "open hazards within N metres" and never learns what a radian is, and the
 * `$geoWithin` / earth-radius arithmetic that used to sit inline in the controller
 * exists in exactly one place.
 */

/** Mean earth radius in metres — the divisor $centerSphere needs to take radians. */
const EARTH_RADIUS_METERS = 6_378_100;

/**
 * Photos are excluded from every list query.
 *
 * The map polls this endpoint; when photos were base64 blobs stored inline, each
 * response shipped megabytes of image data that the caller immediately discarded.
 */
const WITHOUT_PHOTOS = '-hazardPhotos';

const REPORTER_FIELDS = 'email name';

export interface ListFilters {
  limit: number;
  status?: HazardStatus | undefined;
  type?: HazardType | undefined;
  unsolved?: boolean | undefined;
  search?: string | undefined;
}

export class HazardRepository {
  /** Public map listing. Photos omitted; the client fetches a hazard by id for those. */
  async findAll(filters: ListFilters): Promise<HazardEntity[]> {
    return Hazard.find(this.buildFilter(filters))
      .select(WITHOUT_PHOTOS)
      .sort({ createdAt: -1 })
      .limit(filters.limit)
      .populate('reportedBy', REPORTER_FIELDS)
      .lean<HazardEntity[]>()
      .exec();
  }

  async findByReporter(reporterId: Types.ObjectId, limit: number): Promise<HazardEntity[]> {
    return Hazard.find({ reportedBy: reporterId })
      .select(WITHOUT_PHOTOS)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('reportedBy', REPORTER_FIELDS)
      .lean<HazardEntity[]>()
      .exec();
  }

  async countByStatus(status: HazardStatus): Promise<number> {
    return Hazard.countDocuments({ status }).exec();
  }

  /**
   * Hazards within `radiusMeters` of a point, restricted to unresolved ones.
   *
   * `$centerSphere` takes its radius in radians, hence the division by the earth's
   * radius. Backed by the `2dsphere` index on `location`.
   *
   * `fields` lets the duplicate check ask for only what it compares — the old code
   * pulled whole documents (base64 photos included) just to read `type`.
   */
  async findNearbyUnresolved(
    longitude: number,
    latitude: number,
    radiusMeters: number,
    options: { limit: number; fields?: string; populate?: boolean } = { limit: 50 }
  ): Promise<HazardEntity[]> {
    const query = Hazard.find({
      status: { $in: UNRESOLVED_STATUSES },
      location: {
        $geoWithin: {
          $centerSphere: [[longitude, latitude], radiusMeters / EARTH_RADIUS_METERS],
        },
      },
    })
      .select(options.fields ?? WITHOUT_PHOTOS)
      .sort({ createdAt: -1 })
      .limit(options.limit);

    if (options.populate) query.populate('reportedBy', REPORTER_FIELDS);

    return query.lean<HazardEntity[]>().exec();
  }

  /** Full document including photos — used by GET /hazards/:id. */
  async findById(id: string): Promise<HazardEntity | null> {
    return Hazard.findById(id).populate('reportedBy', REPORTER_FIELDS).lean<HazardEntity>().exec();
  }

  /** Hydrated document (not lean) for mutation paths that need `.save()`. */
  async findDocumentById(id: string): Promise<HazardEntity | null> {
    return Hazard.findById(id).exec();
  }

  async create(data: Partial<HazardEntity>): Promise<HazardEntity> {
    const created = await Hazard.create(data);
    // Re-read so the response carries the populated reporter, matching every other read.
    const populated = await this.findById(created._id.toString());
    return populated ?? created;
  }

  /**
   * Saves a hydrated document.
   *
   * Deliberately `.save()` rather than `findOneAndUpdate`: the `pre('save')` hook on
   * the entity is what keeps the GeoJSON `location` in sync with lat/lng, and atomic
   * update operators bypass it.
   */
  async save(doc: HazardEntity): Promise<HazardEntity> {
    await doc.save();
    const populated = await this.findById(doc._id.toString());
    return populated ?? doc;
  }

  async deleteById(id: string): Promise<void> {
    await Hazard.findByIdAndDelete(id).exec();
  }

  private buildFilter(f: ListFilters): QueryFilter<HazardEntity> {
    const filter: QueryFilter<HazardEntity> = {};

    if (f.unsolved) {
      filter.status = { $in: UNRESOLVED_STATUSES };
    } else if (f.status) {
      filter.status = f.status;
    }

    if (f.type) filter.type = f.type;

    if (f.search) {
      // Escaped so a user searching for "(" doesn't crash the query or scan pathologically.
      const escaped = f.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { address: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
      ];
    }

    return filter;
  }
}
