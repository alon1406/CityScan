import type { Response } from 'express';
import Log from '../models/Log.js';
import type { AuthRequest } from '../middleware/auth.middleware.js';

// ========== LIST ==========
/**
 * GET /logs — list logs with optional filters (userId, action, resource, from, to).
 * Requires auth.
 */
export async function list(req: AuthRequest, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    const { userId, action, resource, from, to, limit } = req.query as {
      userId?: string;
      action?: string;
      resource?: string;
      from?: string;
      to?: string;
      limit?: string;
    };

    const filter: Record<string, unknown> = {};
    if (userId) filter.userId = userId;
    if (action) filter.action = action;
    if (resource) filter.resource = resource;
    if (from || to) {
      filter.createdAt = {};
      if (from) (filter.createdAt as Record<string, Date>).$gte = new Date(from);
      if (to) (filter.createdAt as Record<string, Date>).$lte = new Date(to);
    }

    const limitNum = Math.min(Number(limit) || 100, 500);
    const logs = await Log.find(filter).sort({ createdAt: -1 }).limit(limitNum).lean();

    res.json(logs);
  } catch (err) {
    console.error('Logs list error:', err);
    res.status(500).json({ message: 'Failed to list logs' });
  }
}

// ========== CREATE ==========
/**
 * POST /logs — create a log entry (e.g. for manual audit). Requires auth; userId = req.user._id.
 */
export async function create(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }

    const { action, resource, resourceId, details } = req.body as {
      action?: string;
      resource?: string;
      resourceId?: string;
      details?: Record<string, unknown>;
    };

    if (!action || !resource) {
      res.status(400).json({ message: 'action and resource are required' });
      return;
    }

    const createData = {
      userId: user._id,
      action: String(action).trim(),
      resource: String(resource).trim(),
      ...(resourceId && { resourceId }),
      ...(details && typeof details === 'object' && { details }),
    };

    const log = await Log.create(createData as Parameters<typeof Log.create>[0]);
    res.status(201).json((log as { toObject: () => object }).toObject());
  } catch (err) {
    console.error('Log create error:', err);
    res.status(500).json({ message: 'Failed to create log' });
  }
}
