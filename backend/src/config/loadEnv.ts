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
 * Precedence, highest first (Spring's `application-{profile}.properties`):
 *   1. real OS environment  — always wins (Docker, Render, CI)
 *   2. .env.{NODE_ENV}      — the active profile
 *   3. .env                 — shared defaults
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/config -> src -> backend   (and dist/config -> dist -> backend)
const backendRoot = path.resolve(here, '..', '..');

const activeProfile = process.env.NODE_ENV?.trim() || 'development';
process.env.NODE_ENV = activeProfile;

/**
 * Apply one env file without clobbering anything already set.
 *
 * Deliberately not `dotenv.config()`. dotenv skips a key only when it is *absent*
 * from process.env, so a blank `JWT_SECRET=` line in a profile file counts as "set"
 * and shadows the real value in the shared `.env` — the profile templates ship
 * exactly such blank lines to document optional keys, so the intent is
 * "not provided here", never "provided as empty".
 *
 * Blank values are therefore ignored on both sides: a blank line neither takes
 * effect nor blocks a lower-precedence file from supplying the value.
 */
function applyEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const parsed = dotenv.parse(fs.readFileSync(filePath));

  for (const [key, rawValue] of Object.entries(parsed)) {
    if (rawValue.trim() === '') continue;

    const existing = process.env[key];
    if (existing !== undefined && existing.trim() !== '') continue;

    process.env[key] = rawValue;
  }
}

/**
 * Tests are hermetic: they never read env files.
 *
 * `tests/setup.ts` sets every variable the suite needs explicitly. Reading the
 * developer's `.env` here would make results depend on one machine's local
 * configuration — which is not hypothetical: a real `AI_SERVICE_URL` leaking into
 * the test profile once made a test assert the opposite of what it intended.
 */
if (activeProfile !== 'test') {
  applyEnvFile(path.join(backendRoot, `.env.${activeProfile}`));
  applyEnvFile(path.join(backendRoot, '.env'));
}

export const ACTIVE_PROFILE = activeProfile;
export const BACKEND_ROOT = backendRoot;
