import mongoose, { Schema, Document, Model, Types } from 'mongoose';

export interface ILog extends Document {
  userId?: Types.ObjectId;
  action: string;
  resource: string;
  resourceId?: Types.ObjectId;
  details?: Record<string, unknown>;
  createdAt: Date;
}

const logSchema = new Schema<ILog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: Schema.Types.ObjectId },
    details: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Use createdAt for query/sort; updatedAt not needed for logs
logSchema.index({ createdAt: -1 });
logSchema.index({ userId: 1, createdAt: -1 });
logSchema.index({ resource: 1, resourceId: 1 });

const Log: Model<ILog> = mongoose.models.Log ?? mongoose.model<ILog>('Log', logSchema);
export default Log;
