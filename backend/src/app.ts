import path from 'node:path';
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { createContainer, type Container } from './container.js';
import { config } from './config/env.js';
import {
  hazardRoutes,
  authRoutes,
  userRoutes,
  logRoutes,
  healthRoutes,
} from './routes/index.js';
import {
  createAuthMiddleware,
  createOptionalAuth,
  demoRestrict,
  rateLimiter,
  authRateLimiter,
  errorHandler,
  notFoundHandler,
} from './middleware/index.js';

/**
 * Builds the Express application.
 *
 * Deliberately does not listen, connect to a database, or load environment variables —
 * `server.ts` owns all three. Separating construction from startup is what makes the
 * app testable: a test can call `createApp()` against an in-memory database without a
 * port ever being bound.
 */
export function createApp(container: Container = createContainer()): Express {
  const app = express();

  // Behind Nginx Proxy Manager in Phase 3; without this the rate limiter would see
  // every request as coming from the proxy's single IP.
  app.set('trust proxy', 1);

  // --- Security & parsing ---
  app.use(
    cors(
      config.cors.origins
        ? { origin: config.cors.origins, credentials: true }
        : {} // development only — production start-up refuses an unset origin
    )
  );
  app.use(
    helmet({
      // Photos are served from this origin and embedded by the frontend on another.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );
  app.use(express.json({ limit: '8mb' }));

  app.use(rateLimiter);

  // Resolves req.user when a token is present. Must precede demoRestrict, which
  // needs to know who is calling.
  app.use(createOptionalAuth(container.auth));
  app.use(demoRestrict);

  // --- Static: compressed hazard photos ---
  const uploadsPath = path.isAbsolute(config.photos.dir)
    ? config.photos.dir
    : path.join(config.backendRoot, config.photos.dir);
  app.use(
    config.photos.routePrefix,
    express.static(uploadsPath, {
      immutable: true, // filenames carry a uuid, so a given URL never changes content
      maxAge: '30d',
      fallthrough: true,
    })
  );

  // --- Routes ---
  const authMiddleware = createAuthMiddleware(container.auth);

  app.use('/health', healthRoutes(container.events, container.ai));
  app.use('/auth', authRateLimiter, authRoutes(container.controllers.auth));
  app.use('/users', userRoutes(container.controllers.user, authMiddleware));
  app.use('/hazards', hazardRoutes(container.controllers.hazard, authMiddleware));
  app.use('/logs', logRoutes(container.controllers.log, authMiddleware));

  app.get('/', (_req, res) => {
    res.json({ name: 'CityScan API', status: 'running', profile: config.profile });
  });

  // --- Terminal handlers, in this order ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
