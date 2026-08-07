import type { Types } from 'mongoose';
import type { HazardEntity } from '../data/hazard.entity.js';
import type { HazardBoundary } from '../boundaries/hazard.boundary.js';
import type { UserRefBoundary } from '../boundaries/user.boundary.js';
import { config } from '../config/env.js';
import { UserConverter } from './user.converter.js';

/**
 * HazardEntity <-> HazardBoundary.
 *
 * The layer SmartCollect calls `converters`, and its guide justifies as *"אחריות אחת
 * ומוגדרת… שינוי במיפוי נעשה במקום אחד בלבד"* — one responsibility, so a mapping
 * change happens in exactly one place.
 *
 * It earns that here: the old controllers handed raw `.lean()` documents straight to
 * `res.json()`, so there was no boundary at all between the Mongo document and the
 * wire. Three things now happen in one place instead of leaking everywhere:
 *
 *  1. `reportedBy` is normalised — Mongoose hands back either a populated object or a
 *     bare ObjectId depending on the query, and the client always expects an object.
 *  2. Stored photo paths become absolute URLs when PUBLIC_BASE_URL is configured.
 *  3. `location`, `__v` and anything else internal simply never reaches the boundary.
 */
export class HazardConverter {
  constructor(private readonly userConverter: UserConverter) {}

  toBoundary(entity: HazardEntity): HazardBoundary {
    const boundary: HazardBoundary = {
      _id: entity._id.toString(),
      type: entity.type,
      latitude: entity.latitude,
      longitude: entity.longitude,
      status: entity.status,
      reportedBy: this.toReporter(entity.reportedBy),
      createdAt: toIso(entity.createdAt),
      updatedAt: toIso(entity.updatedAt),
    };

    if (entity.description) boundary.description = entity.description;
    if (entity.address) boundary.address = entity.address;
    if (entity.hazardPhotos?.length) {
      boundary.hazardPhotos = entity.hazardPhotos.map((p) => this.toPublicUrl(p));
    }

    return boundary;
  }

  toBoundaryList(entities: HazardEntity[]): HazardBoundary[] {
    return entities.map((e) => this.toBoundary(e));
  }

  /**
   * A relative stored path becomes absolute when PUBLIC_BASE_URL is set.
   *
   * Values that are already absolute are passed through untouched — that covers
   * historical rows whose `hazardPhotos` still hold base64 data URLs, so existing
   * reports keep rendering after the migration to disk storage.
   */
  private toPublicUrl(stored: string): string {
    if (/^(https?:)?\/\//i.test(stored) || stored.startsWith('data:')) return stored;
    const base = config.photos.publicBaseUrl;
    return base ? `${base}${stored}` : stored;
  }

  /** Mongoose returns a populated doc, a bare ObjectId, or a hex string. Normalise all three. */
  private toReporter(reportedBy: HazardEntity['reportedBy']): UserRefBoundary {
    const raw = reportedBy as unknown;

    if (raw && typeof raw === 'object' && 'email' in raw) {
      return this.userConverter.toRefBoundary(
        raw as { _id: Types.ObjectId; email: string; name?: string }
      );
    }

    // Not populated — return the id alone rather than inventing a user.
    return { _id: String(raw ?? ''), email: '' };
  }
}

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
