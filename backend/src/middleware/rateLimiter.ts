import rateLimit from 'express-rate-limit';

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000; // 15 min default
const max = Number(process.env.RATE_LIMIT_MAX) || 500; // 500 req per window to avoid 429 during dev/demo

/** General API rate limit — applies to all routes */
export const rateLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
});

const authWindowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const authMax = Number(process.env.AUTH_RATE_LIMIT_MAX) || 100;

/** Stricter limit for login/register to reduce brute-force risk. Demo login is skipped (no credentials). */
export const authRateLimiter = rateLimit({
  windowMs: authWindowMs,
  max: authMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/demo' || req.originalUrl?.endsWith('/auth/demo'),
});
