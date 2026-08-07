import { Router } from 'express';
import type { EventsService } from '../logic/events.service.js';
import type { AiService } from '../logic/ai.service.js';
import { connectionState } from '../config/db.js';
import { config } from '../config/env.js';

export function healthRoutes(events: EventsService, ai: AiService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ message: 'OK', profile: config.profile });
  });

  /**
   * Reports what is actually wired up.
   *
   * `ai.enabled` is worth surfacing: before this refactor the AI service was silently
   * disabled in development — the config read happened before dotenv loaded — and there
   * was no way to tell from the outside. Now it is one request away.
   */
  router.get('/db', (_req, res) => {
    const state = connectionState();
    res.status(state.ready ? 200 : 503).json({
      ok: state.ready,
      message: state.ready ? 'MongoDB connected' : 'DB not connected',
      readyState: state.code,
      readyStateName: state.name,
      profile: config.profile,
      aiEnabled: ai.enabled,
      sseSubscribers: events.subscriberCount(),
    });
  });

  return router;
}
