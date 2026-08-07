import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware.js';
import { config } from '../config/env.js';
import { ForbiddenException } from '../errors/index.js';

/**
 * Keeps the public demo admin read-only, so a recruiter clicking around cannot delete
 * anyone's data. Allows every GET plus status updates on a single hazard; blocks all
 * other writes.
 *
 * BUG FIX: this guard has never actually fired. It compared against a literal
 * `'admin-demo@cityscan.demo'` while `controllers/auth.ts` created the demo account as
 * `'guest_admin@cityscan.com'` — two different addresses, so `email !== DEMO_ADMIN` was
 * always true and every request fell straight through to `next()`. Both sides now read
 * the same value from `config.demo.adminEmail`, which is exactly why identity belongs
 * in configuration rather than in a literal repeated across files.
 *
 * Must run after `optionalAuth`, which is what puts `req.user` on the request.
 */
const HAZARD_ID_PATH = /^\/hazards\/[0-9a-fA-F]{24}$/;

export function demoRestrict(req: AuthRequest, _res: Response, next: NextFunction): void {
  const email = req.user?.email;
  if (!email || email.toLowerCase() !== config.demo.adminEmail) {
    next();
    return;
  }

  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  const path = (req.originalUrl || req.url || '').split('?')[0] ?? '';

  // Logging in again is always allowed.
  if (method === 'POST' && (path === '/auth/login' || path === '/auth/demo' || path === '/auth/demo-login')) {
    next();
    return;
  }

  // The one write the demo admin may perform: moving a report's status.
  if (method === 'PATCH' && HAZARD_ID_PATH.test(path)) {
    next();
    return;
  }

  next(new ForbiddenException('This action is not allowed in demo mode.'));
}
