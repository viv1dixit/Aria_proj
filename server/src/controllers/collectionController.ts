import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware';
import { Collection } from '../models/Collection';
import { ItemCollection } from '../models/ItemCollection';
import { SavedItem } from '../models/SavedItem';

// GET /api/collections
export const listCollections = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const collections = await Collection.find({ userId }).lean();

    const counts = await ItemCollection.aggregate([
      { $match: { collectionId: { $in: collections.map((c) => c._id) } } },
      { $group: { _id: '$collectionId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const result = collections.map((c) => ({ ...c, itemCount: countMap.get(c._id.toString()) ?? 0 }));
    return res.status(200).json({ collections: result });
  } catch (error) {
    console.error('listCollections error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/collections
export const createCollection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, description, color, isPublic } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const collection = await Collection.create({ userId, name, description, color, isPublic });
    return res.status(201).json({ collection });
  } catch (error) {
    console.error('createCollection error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/collections/:id
export const updateCollection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const allowed = ['name', 'description', 'color', 'isPublic'];
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) updates[k] = v;
    }
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const collection = await Collection.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: updates },
      { new: true }
    );
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    return res.status(200).json({ collection });
  } catch (error) {
    console.error('updateCollection error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/collections/:id
export const deleteCollection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const collection = await Collection.findOneAndDelete({ _id: req.params.id, userId });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    await ItemCollection.deleteMany({ collectionId: collection._id });
    return res.status(200).json({ message: 'Collection deleted' });
  } catch (error) {
    console.error('deleteCollection error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/collections/:id/items
export const addItemToCollection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });

    const [collection, item] = await Promise.all([
      Collection.findOne({ _id: req.params.id, userId }),
      SavedItem.findOne({ _id: itemId, userId }),
    ]);
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    await ItemCollection.findOneAndUpdate(
      { itemId: item._id, collectionId: collection._id },
      { itemId: item._id, collectionId: collection._id },
      { upsert: true }
    );
    return res.status(200).json({ message: 'Item added to collection' });
  } catch (error) {
    console.error('addItemToCollection error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/collections/:id/items/:itemId
export const removeItemFromCollection = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const collection = await Collection.findOne({ _id: req.params.id, userId });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });

    await ItemCollection.deleteOne({
      itemId: new mongoose.Types.ObjectId(req.params.itemId),
      collectionId: collection._id,
    });
    return res.status(200).json({ message: 'Item removed from collection' });
  } catch (error) {
    console.error('removeItemFromCollection error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
