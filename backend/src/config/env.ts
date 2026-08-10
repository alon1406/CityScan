/**
 * The single source of truth for configuration.
 *
 * Rule enforced across this codebase: **no module reads `process.env` at import time.**
 * Everything imports `config` from here instead. That rule is what keeps the
 * env-loading bug described in `loadEnv.ts` from coming back — this module is only
 * ever evaluated after `loadEnv.ts` has run, and it validates loudly instead of
 * falling back to a silent default.
 *
 * This is the Node equivalent of SmartCollect's `@Value("${spring.application.name}")`
 * constructor injection: identity and settings come from configuration, never from a
 * literal buried in a service.
 */
import { z } from 'zod';
import { ACTIVE_PROFILE, BACKEND_ROOT } from './loadEnv.js';

const isProduction = ACTIVE_PROFILE === 'production';

/** Comma-separated origins -> string[]. Empty/unset -> undefined. */
const originList = z
  .string()
  .trim()
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const parts = v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  // --- Database ---
  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().trim().min(1).default('cityscan'),

  // --- Auth ---
  // In production a real secret is mandatory. In development we allow a fallback so a
  // fresh clone runs, but it is a named constant rather than a silent surprise.
  JWT_SECRET: z.string().trim().min(1).optional(),
  JWT_EXPIRES_IN: z.string().trim().min(1).default('7d'),

  // --- CORS ---
  FRONTEND_URL: originList,
  CORS_ORIGIN: originList,

  // --- Rate limiting ---
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(500),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  // --- AI service (optional; absent means duplicate-detection falls back to geo only) ---
  AI_SERVICE_URL: z.string().trim().url().optional().or(z.literal('').transform(() => undefined)),
  AI_SERVICE_API_KEY: z.string().trim().optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  AI_ANALYZE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // --- Photo storage ---
  UPLOADS_DIR: z.string().trim().min(1).default('uploads'),
  /** Public base for generated photo URLs. Empty -> relative URLs, which works behind any proxy. */
  PUBLIC_BASE_URL: z.string().trim().optional(),
  PHOTO_MAX_COUNT: z.coerce.number().int().positive().max(20).default(10),
  PHOTO_MAX_WIDTH: z.coerce.number().int().positive().default(1600),
  PHOTO_WEBP_QUALITY: z.coerce.number().int().min(1).max(100).default(80),
  /** Cap on a single inbound base64 string, before compression. */
  PHOTO_MAX_INPUT_BYTES: z.coerce.number().int().positive().default(8_000_000),

  // --- Domain constants (config, not literals in a service) ---
  DUPLICATE_RADIUS_METERS: z.coerce.number().positive().default(50),
  DEMO_ADMIN_EMAIL: z.string().trim().toLowerCase().default('admin-demo@cityscan.demo'),
  DEMO_USER_EMAIL: z.string().trim().toLowerCase().default('user-demo@cityscan.demo'),
  DEMO_PASSWORD: z.string().trim().min(1).default('demo123'),

  // --- SSE ---
  SSE_HEARTBEAT_MS: z.coerce.number().int().positive().default(25_000),

  // --- Demo reset (public portfolio deployment only) ---
  // Deliberately NOT keyed off NODE_ENV. The portfolio deployment runs the production
  // profile, so gating on that would either expose a destructive endpoint everywhere or
  // nowhere. This is an explicit, separate opt-in that only the demo host sets.
  DEMO_RESET_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DEMO_RESET_TOKEN: z.string().trim().min(16, 'DEMO_RESET_TOKEN must be at least 16 characters').optional(),
});

/**
 * Blank means "not set".
 *
 * An empty environment variable is how a shell, a Docker `environment:` block or a
 * template file expresses "no value" — treating `''` as a real value makes every
 * `.optional()` below unreachable and turns a blank line into a validation failure.
 */
const rawEnv = Object.fromEntries(
  Object.entries(process.env).filter(([, v]) => v !== undefined && v.trim() !== '')
);

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(
    `\n Invalid configuration for profile "${ACTIVE_PROFILE}":\n${lines.join('\n')}\n\n` +
      `Check backend/.env.${ACTIVE_PROFILE} and backend/.env (see .env.example).\n`
  );
  process.exit(1);
}

const e = parsed.data;

const DEV_JWT_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

// Production guards. These are the checks that were missing: previously an unset
// JWT_SECRET silently signed tokens with a public constant, and an unset FRONTEND_URL
// silently allowed every origin.
const fatal: string[] = [];
if (isProduction) {
  if (!e.JWT_SECRET) {
    fatal.push('JWT_SECRET must be set in production');
  } else if (e.JWT_SECRET.length < 32) {
    fatal.push('JWT_SECRET must be at least 32 characters in production');
  }
  if (!e.FRONTEND_URL && !e.CORS_ORIGIN) {
    fatal.push('FRONTEND_URL (or CORS_ORIGIN) must be set in production — refusing to allow all origins');
  }
}

// The reset endpoint wipes the database. Enabling it without a token would leave a
// destructive operation open to anyone who guesses the path.
if (e.DEMO_RESET_ENABLED && !e.DEMO_RESET_TOKEN) {
  fatal.push('DEMO_RESET_ENABLED=true requires DEMO_RESET_TOKEN — refusing to expose an unauthenticated database wipe');
}
if (fatal.length > 0) {
  console.error(`\n Refusing to start in production:\n${fatal.map((m) => `  - ${m}`).join('\n')}\n`);
  process.exit(1);
}

if (!e.JWT_SECRET && !isProduction) {
  console.warn('  JWT_SECRET is not set — using the development fallback. Tokens are not secure.');
}
if (!e.AI_SERVICE_URL) {
  console.warn('  AI_SERVICE_URL is not set — duplicate detection will use geo matching only.');
}

export const config = Object.freeze({
  profile: ACTIVE_PROFILE,
  isProduction,
  isDevelopment: ACTIVE_PROFILE === 'development',
  isTest: ACTIVE_PROFILE === 'test',
  backendRoot: BACKEND_ROOT,
  port: e.PORT,

  db: Object.freeze({
    uri: e.MONGODB_URI,
    name: e.MONGODB_DB_NAME,
  }),

  jwt: Object.freeze({
    secret: e.JWT_SECRET ?? DEV_JWT_SECRET,
    expiresIn: e.JWT_EXPIRES_IN,
  }),

  cors: Object.freeze({
    /** undefined = allow all (development only; production is guarded above). */
    origins: e.FRONTEND_URL ?? e.CORS_ORIGIN,
  }),

  rateLimit: Object.freeze({
    windowMs: e.RATE_LIMIT_WINDOW_MS,
    max: e.RATE_LIMIT_MAX,
    authWindowMs: e.AUTH_RATE_LIMIT_WINDOW_MS,
    authMax: e.AUTH_RATE_LIMIT_MAX,
  }),

  ai: Object.freeze({
    url: e.AI_SERVICE_URL?.replace(/\/$/, ''),
    apiKey: e.AI_SERVICE_API_KEY,
    timeoutMs: e.AI_TIMEOUT_MS,
    analyzeTimeoutMs: e.AI_ANALYZE_TIMEOUT_MS,
    get enabled(): boolean {
      return Boolean(e.AI_SERVICE_URL);
    },
  }),

  photos: Object.freeze({
    dir: e.UPLOADS_DIR,
    publicBaseUrl: e.PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '',
    maxCount: e.PHOTO_MAX_COUNT,
    maxWidth: e.PHOTO_MAX_WIDTH,
    webpQuality: e.PHOTO_WEBP_QUALITY,
    maxInputBytes: e.PHOTO_MAX_INPUT_BYTES,
    /** URL path the uploads directory is served from. */
    routePrefix: '/uploads',
  }),

  hazards: Object.freeze({
    duplicateRadiusMeters: e.DUPLICATE_RADIUS_METERS,
  }),

  demo: Object.freeze({
    adminEmail: e.DEMO_ADMIN_EMAIL,
    userEmail: e.DEMO_USER_EMAIL,
    password: e.DEMO_PASSWORD,
  }),

  sse: Object.freeze({
    heartbeatMs: e.SSE_HEARTBEAT_MS,
  }),

  demoReset: Object.freeze({
    enabled: e.DEMO_RESET_ENABLED,
    token: e.DEMO_RESET_TOKEN,
  }),
});

export type AppConfig = typeof config;
