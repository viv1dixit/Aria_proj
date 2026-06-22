import { Router } from 'express';
import { getConversations } from '../controllers/conversationController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticate, getConversations);

export default router;
