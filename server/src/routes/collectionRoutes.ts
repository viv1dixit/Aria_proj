import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import {
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  addItemToCollection,
  removeItemFromCollection,
} from '../controllers/collectionController';

const router = Router();
router.use(authenticate);

router.get('/', listCollections);
router.post('/', createCollection);
router.patch('/:id', updateCollection);
router.delete('/:id', deleteCollection);
router.post('/:id/items', addItemToCollection);
router.delete('/:id/items/:itemId', removeItemFromCollection);

export default router;
