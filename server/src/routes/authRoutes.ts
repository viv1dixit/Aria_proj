import { Router } from 'express';
import { register, login, me } from '../controllers/authController';
import { googleAuth, googleCallback } from '../controllers/googleAuthController';
import { authenticate } from '../middleware/authMiddleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, me);

router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

export default router;
