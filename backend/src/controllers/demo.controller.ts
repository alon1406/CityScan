import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { DemoService } from '../logic/demo.service.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { UnauthorizedException } from '../errors/index.js';
import { config } from '../config/env.js';

/**
 * Restores the public demo to its seeded state. Called on a schedule by n8n.
 *
 * This is the most destructive endpoint in the application, so it carries two
 * independent guards: the route is not registered at all unless DEMO_RESET_ENABLED is
 * true (see routes/demo.routes.ts), and a shared secret is required here. Neither
 * depends on NODE_ENV, because the portfolio deployment *is* production.
 */
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  reset = asyncHandler(async (req: Request, res: Response) => {
    this.assertAuthorized(req);

    const summary = await this.demo.resetToSeed();

    console.log(
      `[demo-reset] removed ${summary.hazardsRemoved} hazards, ${summary.photosRemoved} photos, ` +
        `${summary.usersRemoved} visitor accounts; seeded ${summary.hazardsSeeded} in ${summary.durationMs}ms`
    );

    res.json({ message: 'Demo reset to seeded state', ...summary });
  });

  private assertAuthorized(req: Request): void {
    const expected = config.demoReset.token;
    if (!expected) throw new UnauthorizedException('Demo reset is not configured');

    const header = req.get('X-Demo-Reset-Token') ?? '';

    // Constant-time comparison so the token cannot be recovered by timing the response.
    // Lengths are compared first because timingSafeEqual throws on a length mismatch.
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid or missing X-Demo-Reset-Token');
    }
  }
}
