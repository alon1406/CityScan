import type { Types } from 'mongoose';
import type { UpdateMeBoundary, UserBoundary } from '../boundaries/user.boundary.js';

export interface UsersService {
  getById(id: Types.ObjectId | string): Promise<UserBoundary>;

  /** Throws ConflictException when the new email is taken by someone else. */
  updateProfile(id: Types.ObjectId, input: UpdateMeBoundary): Promise<UserBoundary>;
}
