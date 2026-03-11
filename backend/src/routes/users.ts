import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getMe, updateMe } from '../controllers/users.js';

const router = Router();

// All routes below require a valid JWT (Authorization: Bearer <token>)
router.use(authMiddleware);

// GET /users/me — return current user profile
router.get('/me', getMe);

// PATCH /users/me — update current user (name, email)
router.patch('/me', updateMe);

export { router };
