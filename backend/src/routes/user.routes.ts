import { Router, type RequestHandler } from 'express';
import type { UserController } from '../controllers/user.controller.js';
import { validate } from '../middleware/validate.js';
import { updateMeSchema } from '../boundaries/user.boundary.js';

export function userRoutes(controller: UserController, authMiddleware: RequestHandler): Router {
  const router = Router();

  router.use(authMiddleware);

  router.get('/me', controller.getMe);
  router.patch('/me', validate({ body: updateMeSchema }), controller.updateMe);

  return router;
}
