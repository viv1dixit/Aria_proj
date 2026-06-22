import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { listTags, createTag, updateTag, deleteTag } from '../controllers/tagController';

const router = Router();
router.use(authenticate);

router.get('/', listTags);
router.post('/', createTag);
router.patch('/:id', updateTag);
router.delete('/:id', deleteTag);

export default router;
