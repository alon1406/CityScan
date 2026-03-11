import type { Request, Response, NextFunction } from 'express';
import User from '../models/User.js';
import { verify } from '../services/jwt.js';
import type { IUser } from '../models/User.js';
import type { AuthRequest } from './auth.middleware.js';

/**
 * Optional auth: if Authorization Bearer token is present and valid, set req.user.
 * Does not return 401 when token is missing or invalid — just leaves req.user undefined.
 * Use before demoRestrict so we can identify the demo admin on any request.
 */
export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }
    const token = authHeader.slice(7);
    const payload = verify(token);
    const user = await User.findById(payload.userId);
    if (user) req.user = user as IUser;
  } catch {
    // Invalid or expired token — treat as unauthenticated
  }
  next();
}
