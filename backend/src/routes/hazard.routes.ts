import { Router, type RequestHandler } from 'express';
import type { HazardController } from '../controllers/hazard.controller.js';
import { validate } from '../middleware/validate.js';
import { requireRole } from '../middleware/requireRole.js';
import { idParamSchema } from '../boundaries/common.boundary.js';
import {
  listHazardsQuerySchema,
  adminListQuerySchema,
  nearbyQuerySchema,
  listMineQuerySchema,
  createHazardSchema,
  updateHazardSchema,
  checkSameHazardSchema,
  analyzePhotoSchema,
} from '../boundaries/hazard.boundary.js';

/**
 * URL mapping and guard chaining only.
 *
 * The authorization policy is now readable from this file alone. Previously you had to
 * open the controller and find the hand-written `if (role !== 'admin')` block partway
 * down each handler to know who could call what.
 *
 * Ordering matters: `/nearby`, `/mine`, `/stream` and `/admin/*` are all literal paths
 * that would otherwise be swallowed by `/:id`.
 */
export function hazardRoutes(controller: HazardController, authMiddleware: RequestHandler): Router {
  const router = Router();

  // --- Public reads ---
  router.get('/', validate({ query: listHazardsQuerySchema }), controller.list);
  router.get('/nearby', validate({ query: nearbyQuerySchema }), controller.listNearby);
  router.get('/stream', controller.stream);

  // --- Authenticated reads ---
  router.get('/mine', authMiddleware, validate({ query: listMineQuerySchema }), controller.listMine);

  // --- Admin reads ---
  router.get('/admin/count', authMiddleware, requireRole('admin'), controller.countNewForAdmin);
  router.get(
    '/admin/list',
    authMiddleware,
    requireRole('admin'),
    validate({ query: adminListQuerySchema }),
    controller.listForAdmin
  );

  // --- Public AI proxies ---
  // Unauthenticated by design so the demo can use them; the AI service credentials stay
  // server-side and are never exposed to the browser.
  router.post('/analyze-photo', validate({ body: analyzePhotoSchema }), controller.analyzePhoto);
  router.post(
    '/check-same-hazard',
    validate({ body: checkSameHazardSchema }),
    controller.checkSameHazard
  );

  // --- Writes ---
  router.post('/', authMiddleware, validate({ body: createHazardSchema }), controller.create);
  router.patch(
    '/:id',
    authMiddleware,
    validate({ params: idParamSchema, body: updateHazardSchema }),
    controller.update
  );
  router.delete('/:id', authMiddleware, validate({ params: idParamSchema }), controller.remove);

  // Last: the catch-all id route.
  router.get('/:id', validate({ params: idParamSchema }), controller.getOne);

  return router;
}
