import { Router } from 'express';
import { register, login, demoLogin } from '../controllers/auth.js';

const router = Router();

// POST /auth/register — create new user, get token
router.post('/register', register);

// POST /auth/login — get token for existing user
router.post('/login', login);

// POST /auth/demo or /auth/demo-login — sign in as demo user/admin (find or create guest account)
router.post('/demo', demoLogin);
router.post('/demo-login', demoLogin);

export { router };
