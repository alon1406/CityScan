import { Router } from 'express';
import type { DemoController } from '../controllers/demo.controller.js';
import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';

/**
 * The demo reset route.
 *
 * `app.ts` only mounts this when `config.demoReset.enabled` is true, so on any normal
 * deployment the path does not exist and returns the standard 404 — an attacker cannot
 * even tell the feature is compiled in.
 */
export function demoRoutes(controller: DemoController): Router {
  const router = Router();

  // A wipe should never be callable in a loop, even by someone holding the token.
  // The nightly schedule needs one call a day; six an hour leaves room to trigger it
  // by hand during a demo without opening the door to hammering it.
  const resetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 6,
    standardHeaders: true,
    legacyHeaders: false,
    // Exempt the test profile: the suite resets between cases and would otherwise
    // spend most of its assertions fighting the limiter rather than the behaviour.
    skip: () => config.isTest,
  });

  router.post('/reset', resetLimiter, controller.reset);

  return router;
}
