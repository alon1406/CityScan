import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { UserEntity } from '../data/user.entity.js';
import type { AuthService } from '../logic/auth.service.js';
import type { RequestingUser } from '../logic/hazards.service.js';
import { UnauthorizedException } from '../errors/index.js';

/** A request that may carry an authenticated user. */
export type AuthRequest = Request & { user?: UserEntity };

/** Narrow an `AuthRequest` to the shape the business layer wants. Throws when absent. */
export function requireUser(req: AuthRequest): RequestingUser {
  if (!req.user) throw new UnauthorizedException();
  return { _id: req.user._id, email: req.user.email, role: req.user.role ?? 'user' };
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Hard gate: a valid token is required.
 *
 * Built as a factory taking the service so the middleware has no import-time
 * dependency on a concrete implementation — `container.ts` supplies it.
 */
export function createAuthMiddleware(auth: AuthService): RequestHandler {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    // Already resolved by optionalAuth earlier in the chain — don't hit the DB twice.
    if (req.user) {
      next();
      return;
    }

    const token = bearerToken(req);
    if (!token) {
      next(new UnauthorizedException('Missing or invalid Authorization header'));
      return;
    }

    auth
      .authenticate(token)
      .then((user) => {
        if (!user) {
          next(new UnauthorizedException('Invalid or expired token'));
          return;
        }
        req.user = user;
        next();
      })
      .catch(next);
  };
}

/**
 * Soft gate: attaches the user when a valid token is present, and does nothing
 * otherwise. Runs globally so that `demoRestrict` and the route guards downstream can
 * see who is calling without every public endpoint requiring auth.
 */
export function createOptionalAuth(auth: AuthService): RequestHandler {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token) {
      next();
      return;
    }

    auth
      .authenticate(token)
      .then((user) => {
        if (user) req.user = user;
        next();
      })
      .catch(() => next()); // an unreadable token is simply "not logged in"
  };
}
