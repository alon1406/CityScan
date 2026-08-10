import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Forwards a rejected promise to Express's error pipeline.
 *
 * Without this, an async handler that throws produces an unhandled rejection and a
 * request that hangs until it times out — which is exactly why the old controllers
 * each wrapped themselves in `try/catch` and wrote their own 500 response, leaving the
 * global error middleware in `app.ts` permanently unreachable.
 *
 * Express 5 does forward rejections from async handlers on its own, but wrapping is
 * explicit and keeps the typing honest for handlers whose `req` is an `AuthRequest`.
 */
export function asyncHandler<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => Promise<unknown> | unknown
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req as unknown as Req, res, next)).catch(next);
  };
}
