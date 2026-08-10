import type { Response, NextFunction, RequestHandler } from 'express';
import type { AuthRequest } from './auth.middleware.js';
import { ForbiddenException, UnauthorizedException } from '../errors/index.js';
import type { UserRole } from '../data/enums.js';

/**
 * Route-level role gate.
 *
 * Replaces four copy-pasted blocks that each re-read `req.user`, cast it to
 * `{ role?: string }` and hand-wrote a 401 or 403 — `controllers/hazards.ts` had them
 * at lines 51-59 and 76-85, plus the ownership checks further down.
 *
 * Putting it on the route makes the policy readable from the routes file alone:
 *   router.get('/admin/list', authMiddleware, requireRole('admin'), listForAdmin)
 *
 * SmartCollect instead calls `authService.requireAdmin(...)` as the second statement of
 * every service method — its own guide lists that repetition as debt and points at
 * Spring Security's `@PreAuthorize` as the fix. This is the Express equivalent.
 * Resource-ownership checks stay in the service, where the entity is loaded.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new UnauthorizedException());
      return;
    }

    const role = req.user.role ?? 'user';
    if (!roles.includes(role as UserRole)) {
      next(new ForbiddenException(`Requires role: ${roles.join(' or ')}`));
      return;
    }

    next();
  };
}
