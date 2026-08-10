import { Types } from 'mongoose';
import type { LogsService } from '../logs.service.js';
import type { LogRepository } from '../../repositories/log.repository.js';
import type { LogConverter } from '../../converters/log.converter.js';
import type { CreateLogBoundary, ListLogsQuery, LogBoundary } from '../../boundaries/log.boundary.js';

export class LogsServiceImpl implements LogsService {
  constructor(
    private readonly logs: LogRepository,
    private readonly converter: LogConverter
  ) {}

  async list(query: ListLogsQuery): Promise<LogBoundary[]> {
    const found = await this.logs.findRecent({ limit: query.limit, resource: query.resource });
    return this.converter.toBoundaryList(found);
  }

  async create(input: CreateLogBoundary, userId?: Types.ObjectId): Promise<LogBoundary> {
    const created = await this.logs.create({
      action: input.action,
      resource: input.resource,
      ...(input.resourceId && { resourceId: new Types.ObjectId(input.resourceId) }),
      ...(input.details && { details: input.details }),
      ...(userId && { userId }),
    });
    return this.converter.toBoundary(created);
  }
}
