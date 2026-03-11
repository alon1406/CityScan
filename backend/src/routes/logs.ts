import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { list, create } from '../controllers/logs.js';

const router = Router();

// All log routes require auth
router.use(authMiddleware);

router.get('/', list);
router.post('/', create);

export { router };
