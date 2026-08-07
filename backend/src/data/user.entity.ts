import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
import { USER_ROLES, type UserRole } from './enums.js';

/**
 * The persistence shape of a user.
 *
 * `password` is `select: false`, so a plain `find()` never loads it — a query that
 * needs it must ask explicitly with `.select('+password')`. `converters/user.converter.ts`
 * is the second line of defence: it builds the outgoing boundary field by field, so
 * the hash has nowhere to leak into a response even if it was loaded.
 */
export interface UserEntity extends Document {
  _id: Types.ObjectId;
  email: string;
  password: string;
  name?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserEntity>(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, minlength: 6, select: false },
    name: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, default: 'user' },
  },
  { timestamps: true }
);

export const User: Model<UserEntity> =
  (mongoose.models.User as Model<UserEntity>) ?? mongoose.model<UserEntity>('User', userSchema);

export default User;
