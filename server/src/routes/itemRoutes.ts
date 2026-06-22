import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
  createItem,
  listItems,
  getItem,
  updateItem,
  deleteItem,
  retryItem,
  quickSave,
} from '../controllers/itemController';
import { getSummary, regenerateSummary } from '../controllers/summaryController';
import { addTagToItem, removeTagFromItem } from '../controllers/tagController';
import { listNotes, createNote } from '../controllers/noteController';

const router = Router();
router.use(authenticate);

// Exact routes before parameterized ones
router.post('/quick-save', quickSave);

router.post('/', createItem);
router.get('/', listItems);
router.get('/:id', getItem);
router.patch('/:id', updateItem);
router.delete('/:id', deleteItem);
router.post('/:id/retry', retryItem);

// Summary sub-routes
router.get('/:id/summary', getSummary);
router.post('/:id/summary/regenerate', regenerateSummary);

// Tag sub-routes
router.post('/:id/tags', addTagToItem);
router.delete('/:id/tags/:tagId', removeTagFromItem);

// Notes sub-routes
router.get('/:id/notes', listNotes);
router.post('/:id/notes', createNote);

export default router;
