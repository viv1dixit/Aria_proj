import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { AuthRequest } from '../middleware/authMiddleware';
import { Response } from 'express';
import { addClient, removeClient } from '../utils/sseManager';

const router = Router();

// GET /api/events  — SSE stream for real-time job notifications
router.get('/', authenticate, (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send initial ping so client knows the stream is open
  res.write('event: connected\ndata: {}\n\n');

  addClient(userId, res);

  // Heartbeat every 30s to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(heartbeat); }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(userId, res);
  });
});

export default router;
