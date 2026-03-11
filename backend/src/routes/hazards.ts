import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { list, listNearby, listMine, countNewForAdmin, listAllForAdmin, create, getOne, update, remove, checkSameHazardRoute, analyzePhoto } from '../controllers/hazards.js';

const router = Router();

// Public: list, nearby. Protected: mine, admin/count, admin/list. Then get one (admin routes must be before :id)
router.get('/', list);
router.get('/nearby', listNearby);
router.get('/mine', authMiddleware, listMine);
router.get('/admin/count', authMiddleware, countNewForAdmin);
router.get('/admin/list', authMiddleware, listAllForAdmin);
router.get('/:id', getOne);

// Public: AI proxy and duplicate check (no auth so demo can call; backend sends X-API-Key to ai-service)
router.post('/analyze-photo', analyzePhoto);
router.post('/check-same-hazard', checkSameHazardRoute);

// Protected: create, update, delete require auth
router.post('/', authMiddleware, create);
router.patch('/:id', authMiddleware, update);
router.delete('/:id', authMiddleware, remove);

export { router };
