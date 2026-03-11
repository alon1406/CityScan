import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export type HazardType = 'pothole' | 'broken_streetlight' | 'debris' | 'flooding' | 'other';
export type HazardStatus = 'open' | 'in_progress' | 'resolved';

export interface IHazard extends Document {
  type: HazardType;
  latitude: number;
  longitude: number;
  location?: { type: 'Point'; coordinates: [number, number] };
  description?: string;
  address?: string;
  /** Array of base64 data URLs or URLs for hazard photos */
  hazardPhotos?: string[];
  status: HazardStatus;
  reportedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const hazardSchema = new Schema<IHazard>(
  {
    type: {
      type: String,
      required: true,
      enum: ['pothole', 'broken_streetlight', 'debris', 'flooding', 'other'],
    },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
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
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved'],
      default: 'open',
    },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

hazardSchema.index({ location: '2dsphere' });

hazardSchema.pre('save', function (this: IHazard) {
  if (this.latitude != null && this.longitude != null) {
    this.location = {
      type: 'Point',
      coordinates: [this.longitude, this.latitude],
    };
  }
});

const Hazard: Model<IHazard> =
  mongoose.models.Hazard ?? mongoose.model<IHazard>('Hazard', hazardSchema);
export default Hazard;
