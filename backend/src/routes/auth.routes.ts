import { Router } from 'express';
import type { AuthController } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema, demoLoginSchema } from '../boundaries/auth.boundary.js';

export function authRoutes(controller: AuthController): Router {
  const router = Router();

  router.post('/register', validate({ body: registerSchema }), controller.register);
  router.post('/login', validate({ body: loginSchema }), controller.login);

  // Both paths kept — frontend/src/api/client.ts calls /auth/demo-login.
  router.post('/demo', validate({ body: demoLoginSchema }), controller.demoLogin);
  router.post('/demo-login', validate({ body: demoLoginSchema }), controller.demoLogin);

  return router;
}
