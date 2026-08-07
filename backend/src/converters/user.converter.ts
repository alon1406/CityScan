import type { UserEntity } from '../data/user.entity.js';
import type { UserBoundary, UserRefBoundary } from '../boundaries/user.boundary.js';

/**
 * UserEntity -> UserBoundary.
 *
 * Built field by field on purpose. The old code did the opposite — `user.toObject()`
 * then `delete userObj.password` — repeated at three call sites in `controllers/auth.ts`.
 * That pattern leaks by default: add a field to the schema and it ships to the client
 * until someone remembers to delete it. Here a new field ships only when it is written
 * into the boundary deliberately.
 */
export class UserConverter {
  toBoundary(entity: UserEntity): UserBoundary {
    const boundary: UserBoundary = {
      _id: entity._id.toString(),
      email: entity.email,
      role: entity.role ?? 'user',
      createdAt: toIso(entity.createdAt),
      updatedAt: toIso(entity.updatedAt),
    };
    // `exactOptionalPropertyTypes` — only assign when there is a value to assign.
    if (entity.name) boundary.name = entity.name;
    return boundary;
  }

  /** The trimmed form embedded in a hazard's `reportedBy`. */
  toRefBoundary(entity: Pick<UserEntity, '_id' | 'email' | 'name'>): UserRefBoundary {
    const ref: UserRefBoundary = {
      _id: entity._id.toString(),
      email: entity.email,
    };
    if (entity.name) ref.name = entity.name;
    return ref;
  }
}

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date(0).toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
