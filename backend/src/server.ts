/**
 * Entrypoint.
 *
 * The import order below is load-bearing and must not be rearranged or "tidied".
 * ESM evaluates every import before the module body runs, so environment variables
 * have to be loaded by an import that appears first, not by a `dotenv.config()` call
 * in the body. Getting this wrong is precisely the bug this refactor fixes: the old
 * `app.ts` called `dotenv.config()` on line 12, long after `services/jwt.ts` had
 * already read `process.env.JWT_SECRET` at module scope and fallen back to a hardcoded
 * secret, and after `aiServiceClient.ts` had read an undefined AI_SERVICE_URL and
 * silently disabled every AI call.
 */
import './config/loadEnv.js'; // MUST be first — see above.

import { config } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  console.log(` Starting CityScan API — profile: ${config.profile}`);

  // Connect before listening, so the first request cannot arrive before the DB is up.
  await connectDB();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(` Server listening on http://localhost:${config.port}`);
  });

  // Give in-flight requests a chance to finish before the process dies. Without this,
  // `docker stop` in Phase 3 would cut active connections mid-response.
  const shutdown = (signal: string): void => {
    console.log(`\n${signal} received — shutting down`);
    server.close(() => {
      void disconnectDB().finally(() => process.exit(0));
    });
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error(' Failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
