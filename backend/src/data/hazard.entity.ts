import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { HAZARD_TYPES, HAZARD_STATUSES, type HazardType, type HazardStatus } from './enums.js';

/**
 * The persistence shape of a hazard. Never sent to a client directly —
 * `converters/hazard.converter.ts` maps it to a `HazardBoundary` first.
 */
export interface HazardEntity extends Document {
  _id: Types.ObjectId;
  type: HazardType;
  latitude: number;
  longitude: number;
  /** GeoJSON mirror of latitude/longitude, kept in sync by the pre-save hook below. */
  location?: { type: 'Point'; coordinates: [number, number] };
  description?: string;
  address?: string;
  /**
   * Public URLs of the stored photos.
   *
   * These used to be base64 data URLs held inline, which pushed documents toward
   * MongoDB's 16 MB ceiling and would have filled a free Atlas M0 in ~100 reports.
   * Photos are now compressed to WebP on disk and only the URL lives here.
   */
  hazardPhotos?: string[];
  status: HazardStatus;
  reportedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const hazardSchema = new Schema<HazardEntity>(
  {
    type: { type: String, required: true, enum: HAZARD_TYPES },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: { type: [Number], default: undefined },
    },
    description: { type: String, trim: true },
    address: { type: String, trim: true },
    hazardPhotos: { type: [String], default: undefined },
    status: { type: String, enum: HAZARD_STATUSES, default: 'open' },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Powers the $geoWithin/$centerSphere radius queries in HazardRepository.
hazardSchema.index({ location: '2dsphere' });
// The map and the admin list both sort by newest first.
hazardSchema.index({ status: 1, createdAt: -1 });
hazardSchema.index({ reportedBy: 1, createdAt: -1 });

/**
 * Keep the GeoJSON `location` in sync with the flat lat/lng pair.
 *
 * Note this only fires on `.save()`. `findOneAndUpdate` bypasses it, so the
 * repository never updates coordinates through an atomic update — see
 * `HazardRepository.update`.
 */
hazardSchema.pre('save', function (this: HazardEntity) {
  if (this.latitude != null && this.longitude != null) {
    this.location = { type: 'Point', coordinates: [this.longitude, this.latitude] };
  }
});

export const Hazard: Model<HazardEntity> =
  (mongoose.models.Hazard as Model<HazardEntity>) ??
  mongoose.model<HazardEntity>('Hazard', hazardSchema);

export default Hazard;
