import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { getStats } from '../controllers/statsController';

const router = Router();
router.use(authenticate);
router.get('/', getStats);

export default router;
