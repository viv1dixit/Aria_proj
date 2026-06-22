import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { updateNote, deleteNote } from '../controllers/noteController';

const router = Router();
router.use(authenticate);

router.patch('/:id', updateNote);
router.delete('/:id', deleteNote);

export default router;
