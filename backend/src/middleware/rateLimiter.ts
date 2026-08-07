import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

/**
 * Limits are read from `config`, not from `process.env` at module scope as before —
 * that read ran before dotenv loaded, so every value silently fell back to its default
 * and the `.env` settings had no effect.
 */

/** General API limit. */
export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  /**
   * The SSE endpoint holds one long-lived connection per open tab. Counting it as a
   * request would let a handful of tabs exhaust the window and lock a user out of the
   * whole API, so it is exempt.
   */
  skip: (req) => req.path === '/hazards/stream' || req.path === '/stream',
});

/** Stricter limit on the credential endpoints, to slow brute force. */
export const authRateLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  // The demo button carries no credentials, so there is nothing to brute-force.
  skip: (req) => req.path === '/demo' || req.path === '/demo-login',
});
