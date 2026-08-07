import type { LogEntity } from '../data/log.entity.js';
import type { LogBoundary } from '../boundaries/log.boundary.js';

export class LogConverter {
  toBoundary(entity: LogEntity): LogBoundary {
    const boundary: LogBoundary = {
      _id: entity._id.toString(),
      action: entity.action,
      resource: entity.resource,
      createdAt:
        entity.createdAt instanceof Date
          ? entity.createdAt.toISOString()
          : new Date(entity.createdAt).toISOString(),
    };

    if (entity.userId) boundary.userId = entity.userId.toString();
    if (entity.resourceId) boundary.resourceId = entity.resourceId.toString();
    if (entity.details) boundary.details = entity.details;

    return boundary;
  }

  toBoundaryList(entities: LogEntity[]): LogBoundary[] {
    return entities.map((e) => this.toBoundary(e));
  }
}
