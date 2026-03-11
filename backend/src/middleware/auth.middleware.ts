import type { Request, Response, NextFunction } from 'express';
import User from '../models/User.js';
import { verify } from '../services/jwt.js';
import type { IUser } from '../models/User.js';

// Extend Express Request so we can attach the logged-in user
export type AuthRequest = Request & { user?: IUser };

/**
 * Middleware: read JWT from Authorization header, verify it, load user from DB, set req.user.
 * Use this on routes that require login (e.g. GET /me, PATCH /me).
 */
export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Header format: "Bearer <token>"
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Missing or invalid Authorization header' });
      return;
    }
    const token = authHeader.slice(7); // Remove "Bearer "
    const payload = verify(token); // Throws if invalid/expired
    const user = await User.findById(payload.userId);
    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
