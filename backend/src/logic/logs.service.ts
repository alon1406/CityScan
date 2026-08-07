import type { Types } from 'mongoose';
import type { CreateLogBoundary, ListLogsQuery, LogBoundary } from '../boundaries/log.boundary.js';

export interface LogsService {
  list(query: ListLogsQuery): Promise<LogBoundary[]>;

  create(input: CreateLogBoundary, userId?: Types.ObjectId): Promise<LogBoundary>;
}
