import type { QueryFilter, Types } from 'mongoose';
import { Log, type LogEntity } from '../data/log.entity.js';

export class LogRepository {
  async findRecent(filters: { limit: number; resource?: string | undefined; userId?: Types.ObjectId | undefined }): Promise<LogEntity[]> {
    const filter: QueryFilter<LogEntity> = {};
    if (filters.resource) filter.resource = filters.resource;
    if (filters.userId) filter.userId = filters.userId;

    return Log.find(filter).sort({ createdAt: -1 }).limit(filters.limit).lean<LogEntity[]>().exec();
  }

  async create(data: Partial<LogEntity>): Promise<LogEntity> {
    return Log.create(data);
  }
}
