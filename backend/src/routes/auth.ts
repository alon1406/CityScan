import { Router } from 'express';
import { register, login, demoLogin } from '../controllers/auth.js';

const router = Router();

// POST /auth/register — create new user, get token
router.post('/register', register);

// POST /auth/login — get token for existing user
router.post('/login', login);

// POST /auth/demo — sign in as demo admin or user (creates account if needed)
router.post('/demo', demoLogin);

export { router };
