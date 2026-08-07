import type { Types } from 'mongoose';
import { User, type UserEntity } from '../data/user.entity.js';

/**
 * User queries.
 *
 * `password` is `select: false` on the schema, so the only way to load a hash is the
 * explicitly named `findByEmailWithPassword` below. Everything else physically cannot
 * return it — which is why the login path is the single call site that sees one.
 */
export class UserRepository {
  async findById(id: string | Types.ObjectId): Promise<UserEntity | null> {
    return User.findById(id).exec();
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return User.findOne({ email: email.trim().toLowerCase() }).exec();
  }

  /** The one query that loads the password hash. Used by login and the demo bootstrap. */
  async findByEmailWithPassword(email: string): Promise<UserEntity | null> {
    return User.findOne({ email: email.trim().toLowerCase() }).select('+password').exec();
  }

  async existsByEmail(email: string): Promise<boolean> {
    const found = await User.exists({ email: email.trim().toLowerCase() }).exec();
    return found != null;
  }

  async create(data: Partial<UserEntity>): Promise<UserEntity> {
    return User.create(data);
  }

  async save(doc: UserEntity): Promise<UserEntity> {
    return doc.save();
  }
}
