import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from './auth.middleware.js';

const DEMO_ADMIN_EMAIL = 'admin-demo@cityscan.demo';
const DEMO_BLOCK_MESSAGE = 'This action is not allowed in demo mode.';

/**
 * Restricts demo admin (admin-demo@cityscan.demo) to read-only + status updates.
 * - Allow all GET.
 * - Allow PATCH only to /hazards/:id (report status update).
 * - Block POST, PUT, DELETE with 403.
 * Must run after optionalAuth so req.user is set when token is present.
 */
export function demoRestrict(req: AuthRequest, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    next();
    return;
  }
  const email = (user as unknown as { email?: string }).email;
  if (email !== DEMO_ADMIN_EMAIL) {
    next();
    return;
  }

  const method = req.method.toUpperCase();
  const path = (req.originalUrl || req.url || '').split('?')[0];

  if (method === 'GET') {
    next();
    return;
  }
  // Allow POST to auth so demo admin can log in or use demo endpoint
  if (method === 'POST' && (path === '/auth/login' || path === '/auth/register' || path === '/auth/demo')) {
    next();
    return;
  }
  if (method === 'PATCH') {
    // Allow PATCH only to /hazards/:id (report status update)
    if (/^\/hazards\/[^/]+$/.test(path ?? '')) {
      next();
      return;
    }
    res.status(403).json({ message: DEMO_BLOCK_MESSAGE });
    return;
  }

  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    res.status(403).json({ message: DEMO_BLOCK_MESSAGE });
    return;
  }

  next();
}
