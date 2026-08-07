import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AppException } from '../errors/index.js';
import type { ErrorBoundary } from '../boundaries/common.boundary.js';
import { config } from '../config/env.js';

/**
 * The only place in the application that writes an error response.
 *
 * This is the Express counterpart of Spring's `@ControllerAdvice`. It is also a
 * deliberate improvement on SmartCollect, which has no advice class and never defines
 * an error body at all — so Boot's defaults drop the `message` field entirely and the
 * carefully written exception text ("Object does not exist") never reaches a client.
 * Here the body is an explicit, documented contract: see `ErrorBoundary`.
 *
 * `message` stays the top-level field because `frontend/src/api/client.ts` reads
 * `data.message`. Renaming it would break every error path in the UI.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Headers already sent: the response is mid-flight (an SSE stream, say). Handing it
  // to Express lets it destroy the socket instead of throwing ERR_HTTP_HEADERS_SENT.
  if (res.headersSent) {
    next(err);
    return;
  }

  const mapped = mapError(err);

  const body: ErrorBoundary = {
    message: mapped.message,
    status: mapped.status,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };
  if (mapped.code) body.code = mapped.code;
  if (mapped.details !== undefined) body.details = mapped.details;

  if (mapped.status >= 500) {
    // Unexpected: log the whole thing, we need the stack to fix it.
    console.error(`[${req.method} ${req.originalUrl}]`, err);
  } else if (!config.isProduction) {
    console.warn(`[${req.method} ${req.originalUrl}] ${mapped.status} ${mapped.message}`);
  }

  if (!config.isProduction && err instanceof Error && err.stack) {
    body.stack = err.stack;
  }

  res.status(mapped.status).json(body);
}

interface MappedError {
  status: number;
  message: string;
  code?: string | undefined;
  details?: unknown;
}

function mapError(err: unknown): MappedError {
  // Errors we threw on purpose already know their status.
  if (err instanceof AppException) {
    return {
      status: err.status,
      message: err.message,
      code: err.code,
      details: err.details,
    };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      message: 'Validation failed',
      details: Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    };
  }

  // A malformed id reached a query. Normally the boundary catches this first.
  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, message: `Invalid value for "${err.path}"` };
  }

  if (isMongoDuplicateKey(err)) {
    return { status: 409, message: 'That value is already taken' };
  }

  // express.json() rejecting an oversized body. Keep the original wording — it tells
  // the user what to actually do about it.
  if (hasStatus(err, 413)) {
    return { status: 413, message: 'Request too large. Try fewer or smaller photos.' };
  }

  // Malformed JSON in the request body.
  if (err instanceof SyntaxError && hasStatus(err, 400)) {
    return { status: 400, message: 'Request body is not valid JSON' };
  }

  const status = readStatus(err);
  if (status >= 400 && status < 500) {
    return { status, message: err instanceof Error ? err.message : 'Request failed' };
  }

  // Anything else is a bug. Never leak internals to a production client.
  return {
    status: 500,
    message: config.isProduction
      ? 'Something went wrong'
      : err instanceof Error
        ? err.message
        : 'Something went wrong',
  };
}

function readStatus(err: unknown): number {
  if (typeof err === 'object' && err !== null) {
    const e = err as { status?: unknown; statusCode?: unknown };
    const raw = typeof e.status === 'number' ? e.status : e.statusCode;
    if (typeof raw === 'number' && raw >= 400 && raw < 600) return raw;
  }
  return 500;
}

function hasStatus(err: unknown, status: number): boolean {
  return readStatus(err) === status;
}

function isMongoDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

/** Terminal 404 for unmatched routes. Registered just before `errorHandler`. */
export function notFoundHandler(req: Request, res: Response): void {
  const body: ErrorBoundary = {
    message: `Cannot ${req.method} ${req.originalUrl}`,
    status: 404,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };
  res.status(404).json(body);
}
