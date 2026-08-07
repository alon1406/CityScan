import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { BadRequestException } from '../errors/index.js';

/**
 * Schema validation at the route boundary.
 *
 * Replaces a 4-line stub that was literally `next()` — it was wired into
 * `middleware/index.ts` and exported, so it looked like validation existed while
 * doing nothing at all. Real validation lived as hand-written `if` chains inside the
 * controllers, and as `express-validator` calls run manually at the top of each
 * auth handler.
 *
 * By the time a controller runs, its input is already parsed, coerced and typed.
 */
export interface ValidationTargets {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function validate(targets: ValidationTargets): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = targets[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key] ?? {});

      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: issue.path.join('.') || key,
          message: issue.message,
        }));
        // Surface the first problem in `message` so a client that only renders that
        // field still tells the user something useful; the full list is in `details`.
        const first = details[0];
        next(
          new BadRequestException(
            first ? `${first.field}: ${first.message}` : 'Validation failed',
            details
          )
        );
        return;
      }

      // Express 5 makes `req.query` a getter with no setter, so it cannot be
      // reassigned. Parsed values are exposed on `req.valid` instead, and controllers
      // read from there.
      if (key === 'body') {
        req.body = result.data;
      }
      validated(req)[key] = result.data;
    }

    next();
  };
}

/** Container for parsed input, attached to the request by `validate`. */
export interface ValidatedRequest<B = unknown, Q = unknown, P = unknown> extends Request {
  valid?: { body?: B; query?: Q; params?: P };
}

function validated(req: Request): Record<string, unknown> {
  const r = req as ValidatedRequest;
  if (!r.valid) r.valid = {};
  return r.valid as Record<string, unknown>;
}

/** Typed accessors so controllers don't repeat the cast. */
export function validBody<T>(req: Request): T {
  return (req as ValidatedRequest<T>).valid?.body as T;
}

export function validQuery<T>(req: Request): T {
  return (req as ValidatedRequest<unknown, T>).valid?.query as T;
}

export function validParams<T>(req: Request): T {
  return (req as ValidatedRequest<unknown, unknown, T>).valid?.params as T;
}
