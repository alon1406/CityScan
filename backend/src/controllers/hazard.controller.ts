import type { Request, Response } from 'express';
import type { HazardsService } from '../logic/hazards.service.js';
import type { EventsService, HazardEvent } from '../logic/events.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireUser, type AuthRequest } from '../middleware/auth.middleware.js';
import { validQuery, validParams, validBody } from '../middleware/validate.js';
import { config } from '../config/env.js';
import type {
  ListHazardsQuery,
  AdminListQuery,
  NearbyQuery,
  ListMineQuery,
  CreateHazardBoundary,
  UpdateHazardBoundary,
  CheckSameHazardBoundary,
  AnalyzePhotoBoundary,
} from '../boundaries/hazard.boundary.js';
import type { IdParam } from '../boundaries/common.boundary.js';

/**
 * HTTP only.
 *
 * Compare with what this replaces: a 500-line module where each handler opened with a
 * `try`, re-checked authentication and role by hand, built Mongoose filters inline,
 * did earth-radius arithmetic, called the AI service, and closed with a `catch` that
 * wrote its own `res.status(500)`. That last part is why the global error middleware
 * registered in `app.ts` was never reached.
 *
 * Every handler here does the same three things: read validated input, call the
 * service through its interface, send the result. Failures throw and are rendered by
 * `middleware/errorHandler.ts` — this file never chooses an error status.
 */
export class HazardController {
  constructor(
    private readonly hazards: HazardsService,
    private readonly events: EventsService
  ) {}

  list = asyncHandler(async (req: Request, res: Response) => {
    res.json(await this.hazards.list(validQuery<ListHazardsQuery>(req)));
  });

  listForAdmin = asyncHandler(async (req: Request, res: Response) => {
    res.json(await this.hazards.listForAdmin(validQuery<AdminListQuery>(req)));
  });

  countNewForAdmin = asyncHandler(async (_req: Request, res: Response) => {
    res.json({ count: await this.hazards.countOpen() });
  });

  listMine = asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = requireUser(req);
    const { limit } = validQuery<ListMineQuery>(req);
    res.json(await this.hazards.listByReporter(user._id, limit));
  });

  listNearby = asyncHandler(async (req: Request, res: Response) => {
    res.json(await this.hazards.listNearby(validQuery<NearbyQuery>(req)));
  });

  getOne = asyncHandler(async (req: Request, res: Response) => {
    const { id } = validParams<IdParam>(req);
    res.json(await this.hazards.getById(id));
  });

  create = asyncHandler(async (req: AuthRequest, res: Response) => {
    const created = await this.hazards.create(validBody<CreateHazardBoundary>(req), requireUser(req));
    res.status(201).json(created);
  });

  update = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = validParams<IdParam>(req);
    const updated = await this.hazards.update(id, validBody<UpdateHazardBoundary>(req), requireUser(req));
    res.json(updated);
  });

  remove = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = validParams<IdParam>(req);
    await this.hazards.remove(id, requireUser(req));
    res.status(204).send();
  });

  checkSameHazard = asyncHandler(async (req: Request, res: Response) => {
    res.json(await this.hazards.checkSameHazard(validBody<CheckSameHazardBoundary>(req)));
  });

  analyzePhoto = asyncHandler(async (req: Request, res: Response) => {
    const { image } = validBody<AnalyzePhotoBoundary>(req);
    res.json({ description: await this.hazards.analyzePhoto(image) });
  });

  /**
   * GET /hazards/stream — Server-Sent Events.
   *
   * Replaces the frontend's 8-second poll, which refetched up to 500 hazards forever,
   * even on a backgrounded tab. One idle connection per client instead of ~450
   * requests per hour each.
   *
   * Deliberately not wrapped in `asyncHandler`: the response is long-lived and never
   * "completes", so the usual request/response lifecycle does not apply.
   *
   * Phase 3 note: Nginx Proxy Manager buffers proxied responses by default, which would
   * hold these events until the buffer fills. That location needs `proxy_buffering off`.
   */
  stream = (req: Request, res: Response): void => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Understood by nginx directly; harmless elsewhere.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const send = (event: HazardEvent): void => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    // Lets the client confirm the stream is live rather than guessing from silence.
    res.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);

    const unsubscribe = this.events.subscribe(send);

    // Comment frames keep proxies and load balancers from reaping an idle connection.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), config.sse.heartbeatMs);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe();
    };

    req.on('close', cleanup);
    res.on('error', cleanup);
  };
}
