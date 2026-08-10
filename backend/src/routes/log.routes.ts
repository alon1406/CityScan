import { Router, type RequestHandler } from 'express';
import type { LogController } from '../controllers/log.controller.js';
import { validate } from '../middleware/validate.js';
import { createLogSchema, listLogsQuerySchema } from '../boundaries/log.boundary.js';

export function logRoutes(controller: LogController, authMiddleware: RequestHandler): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/', validate({ query: listLogsQuerySchema }), controller.list);
  router.post('/', validate({ body: createLogSchema }), controller.create);

  return router;
}
