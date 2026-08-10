import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

/** Audit trail row. */
export interface LogEntity extends Document {
  _id: Types.ObjectId;
  userId?: Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: Types.ObjectId;
  details?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const logSchema = new Schema<LogEntity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId },
    details: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

logSchema.index({ createdAt: -1 });
logSchema.index({ userId: 1, createdAt: -1 });
logSchema.index({ resource: 1, resourceId: 1 });

export const Log: Model<LogEntity> =
  (mongoose.models.Log as Model<LogEntity>) ?? mongoose.model<LogEntity>('Log', logSchema);

export default Log;
