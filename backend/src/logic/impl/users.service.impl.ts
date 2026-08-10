import type { Types } from 'mongoose';
import type { UsersService } from '../users.service.js';
import type { UserRepository } from '../../repositories/user.repository.js';
import type { UserConverter } from '../../converters/user.converter.js';
import type { UpdateMeBoundary, UserBoundary } from '../../boundaries/user.boundary.js';
import { ConflictException, NotFoundException } from '../../errors/index.js';

export class UsersServiceImpl implements UsersService {
  constructor(
    private readonly users: UserRepository,
    private readonly converter: UserConverter
  ) {}

  async getById(id: Types.ObjectId | string): Promise<UserBoundary> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return this.converter.toBoundary(user);
  }

  async updateProfile(id: Types.ObjectId, input: UpdateMeBoundary): Promise<UserBoundary> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundException('User not found');

    if (input.email && input.email !== user.email) {
      // Checked here as well as by the unique index, so the caller gets a clear 409
      // rather than a driver-level duplicate-key error.
      if (await this.users.existsByEmail(input.email)) {
        throw new ConflictException('Email already registered');
      }
      user.email = input.email;
    }

    if (input.name !== undefined) user.name = input.name;

    const saved = await this.users.save(user);
    return this.converter.toBoundary(saved);
  }
}
