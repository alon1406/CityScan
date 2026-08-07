/**
 * Side-effect-only module. MUST be the first import in `server.ts`, before anything else.
 *
 * Why this file exists at all: ESM evaluates every `import` before the importing
 * module's body runs. The old `app.ts` called `dotenv.config()` on line 12, but by
 * then `services/jwt.ts` had already read `process.env.JWT_SECRET` at module scope
 * and fallen back to the hardcoded dev secret — and `aiServiceClient.ts` had already
 * read an `undefined` AI_SERVICE_URL, silently disabling every AI call.
 *
 * Loading env in a dedicated module that is imported first makes the ordering
 * explicit and impossible to get wrong by accident.
 *
 * Profile chain (Spring's `application-{profile}.properties`):
 *   1. real OS environment  — always wins (Docker, Render, CI)
 *   2. .env.{NODE_ENV}      — the active profile
 *   3. .env                 — shared defaults
 *
 * dotenv never overwrites a key that is already set, so loading in this order
 * gives precedence to the earlier source.
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/config -> src -> backend   (and dist/config -> dist -> backend)
const backendRoot = path.resolve(here, '..', '..');

const activeProfile = process.env.NODE_ENV?.trim() || 'development';
process.env.NODE_ENV = activeProfile;

dotenv.config({ path: path.join(backendRoot, `.env.${activeProfile}`), quiet: true });
dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });

export const ACTIVE_PROFILE = activeProfile;
export const BACKEND_ROOT = backendRoot;
