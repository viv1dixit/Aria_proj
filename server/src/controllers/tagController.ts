import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { Tag } from '../models/Tag';
import { ItemTag } from '../models/ItemTag';
import { SavedItem } from '../models/SavedItem';
import mongoose from 'mongoose';

// GET /api/tags
export const listTags = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const tags = await Tag.find({ userId }).lean();

    // Attach item count to each tag
    const counts = await ItemTag.aggregate([
      { $match: { tagId: { $in: tags.map((t) => t._id) } } },
      { $group: { _id: '$tagId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [c._id.toString(), c.count]));

    const tagsWithCount = tags.map((t) => ({ ...t, itemCount: countMap.get(t._id.toString()) ?? 0 }));
    return res.status(200).json({ tags: tagsWithCount });
  } catch (error) {
    console.error('listTags error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/tags
export const createTag = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const tag = await Tag.create({ userId, name: name.toLowerCase().trim(), color });
    return res.status(201).json({ tag });
  } catch (error: any) {
    if (error.code === 11000) return res.status(409).json({ error: 'Tag already exists' });
    console.error('createTag error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/tags/:id
export const updateTag = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, color } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.toLowerCase().trim();
    if (color !== undefined) updates.color = color;

    if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    const tag = await Tag.findOneAndUpdate({ _id: req.params.id, userId }, { $set: updates }, { new: true });
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    return res.status(200).json({ tag });
  } catch (error: any) {
    if (error.code === 11000) return res.status(409).json({ error: 'Tag name already in use' });
    console.error('updateTag error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/tags/:id
export const deleteTag = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const tag = await Tag.findOneAndDelete({ _id: req.params.id, userId });
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    await ItemTag.deleteMany({ tagId: tag._id });
    return res.status(200).json({ message: 'Tag deleted' });
  } catch (error) {
    console.error('deleteTag error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/items/:id/tags
export const addTagToItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tagId } = req.body;
    if (!tagId) return res.status(400).json({ error: 'tagId is required' });

    const [item, tag] = await Promise.all([
      SavedItem.findOne({ _id: req.params.id, userId }),
      Tag.findOne({ _id: tagId, userId }),
    ]);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!tag) return res.status(404).json({ error: 'Tag not found' });

    await ItemTag.findOneAndUpdate(
      { itemId: item._id, tagId: tag._id },
      { itemId: item._id, tagId: tag._id },
      { upsert: true }
    );
    return res.status(200).json({ message: 'Tag added to item' });
  } catch (error) {
    console.error('addTagToItem error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/items/:id/tags/:tagId
export const removeTagFromItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await SavedItem.findOne({ _id: req.params.id, userId });
    if (!item) return res.status(404).json({ error: 'Item not found' });

    await ItemTag.deleteOne({
      itemId: item._id,
      tagId: new mongoose.Types.ObjectId(req.params.tagId),
    });
    return res.status(200).json({ message: 'Tag removed from item' });
  } catch (error) {
    console.error('removeTagFromItem error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
