import type { Request, Response } from 'express';
import type { LogsService } from '../logic/logs.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireUser, type AuthRequest } from '../middleware/auth.middleware.js';
import { validBody, validQuery } from '../middleware/validate.js';
import type { CreateLogBoundary, ListLogsQuery } from '../boundaries/log.boundary.js';

export class LogController {
  constructor(private readonly logs: LogsService) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    res.json(await this.logs.list(validQuery<ListLogsQuery>(req)));
  });

  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = requireUser(req);
    const created = await this.logs.create(validBody<CreateLogBoundary>(req), user._id);
    res.status(201).json(created);
  });
}
