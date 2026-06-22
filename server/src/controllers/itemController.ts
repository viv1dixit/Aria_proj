import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/authMiddleware';
import { SavedItem } from '../models/SavedItem';
import { Summary } from '../models/Summary';
import { ItemTag } from '../models/ItemTag';
import { ItemCollection } from '../models/ItemCollection';
import { Tag } from '../models/Tag';
import { itemQueue } from '../queues/itemQueue';

function detectType(url: string): 'youtube' | 'article' | 'unknown' {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
    return 'article';
  } catch {
    return 'unknown';
  }
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

// POST /api/items
export const createItem = async (req: AuthRequest, res: Response) => {
  try {
    const { url, title } = req.body;
    const userId = req.user!.id;

    if (!url) return res.status(400).json({ error: 'url is required' });

    try { new URL(url); } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const type = detectType(url);
    const domain = extractDomain(url);

    const item = await SavedItem.create({ userId, url, type, domain, title: title ?? undefined, status: 'pending' });

    await itemQueue.add('process-item', {
      itemId: item._id.toString(),
      url,
      type,
      userId,
      existingTitle: !!title,
    });

    return res.status(201).json({ item });
  } catch (error) {
    console.error('createItem error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/items
export const listItems = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { userId };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.is_read !== undefined) filter.isRead = req.query.is_read === 'true';
    if (req.query.is_starred !== undefined) filter.isStarred = req.query.is_starred === 'true';
    if (req.query.is_archived !== undefined) filter.isArchived = req.query.is_archived === 'true';

    if (req.query.domain) filter.domain = req.query.domain;

    if (req.query.q) {
      const regex = new RegExp(req.query.q as string, 'i');
      filter.$or = [{ title: regex }, { domain: regex }, { author: regex }];
    }

    // Filter by tag — find item IDs that have this tag linked
    if (req.query.tag) {
      const taggedItemIds = await ItemTag.distinct('itemId', {
        tagId: new mongoose.Types.ObjectId(req.query.tag as string),
      });
      filter._id = { $in: taggedItemIds };
    }

    // Filter by collection — find item IDs in this collection
    if (req.query.collection) {
      const collectionItemIds = await ItemCollection.distinct('itemId', {
        collectionId: new mongoose.Types.ObjectId(req.query.collection as string),
      });
      const existing = filter._id as { $in: mongoose.Types.ObjectId[] } | undefined;
      filter._id = {
        $in: existing
          ? existing.$in.filter((id) => collectionItemIds.some((cid) => cid.equals(id)))
          : collectionItemIds,
      };
    }

    const sortField = (req.query.sort as string) || 'createdAt';
    const sortDir = req.query.order === 'asc' ? 1 : -1;
    const allowedSorts = ['createdAt', 'updatedAt', 'title', 'readTimeMin'];
    const sort: Record<string, 1 | -1> = { [allowedSorts.includes(sortField) ? sortField : 'createdAt']: sortDir };

    const [items, total] = await Promise.all([
      SavedItem.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      SavedItem.countDocuments(filter),
    ]);

    return res.status(200).json({
      items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('listItems error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/items/:id
export const getItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await SavedItem.findOne({ _id: req.params.id, userId }).lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const [summary, itemTags] = await Promise.all([
      Summary.findOne({ itemId: item._id }).lean(),
      ItemTag.find({ itemId: item._id }).populate<{ tagId: InstanceType<typeof Tag> }>('tagId', 'name color').lean(),
    ]);

    const tags = itemTags.map((it) => it.tagId);

    return res.status(200).json({ item, summary, tags });
  } catch (error) {
    console.error('getItem error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/items/:id
export const updateItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const allowed = ['isRead', 'isStarred', 'isArchived', 'readingProgress', 'title'];
    const updates: Record<string, unknown> = {};

    // Accept both camelCase and snake_case from clients
    const fieldMap: Record<string, string> = {
      is_read: 'isRead',
      is_starred: 'isStarred',
      is_archived: 'isArchived',
      reading_progress: 'readingProgress',
    };

    for (const [key, val] of Object.entries(req.body)) {
      const mapped = fieldMap[key] ?? key;
      if (allowed.includes(mapped)) updates[mapped] = val;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const item = await SavedItem.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: updates },
      { new: true }
    );

    if (!item) return res.status(404).json({ error: 'Item not found' });
    return res.status(200).json({ item });
  } catch (error) {
    console.error('updateItem error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/items/:id
export const deleteItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { hard } = req.query;

    if (hard === 'true') {
      const item = await SavedItem.findOneAndDelete({ _id: req.params.id, userId });
      if (!item) return res.status(404).json({ error: 'Item not found' });
      await Promise.all([
        Summary.deleteOne({ itemId: item._id }),
        ItemTag.deleteMany({ itemId: item._id }),
      ]);
      return res.status(200).json({ message: 'Item permanently deleted' });
    }

    // Soft delete — archive it
    const item = await SavedItem.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { isArchived: true } },
      { new: true }
    );
    if (!item) return res.status(404).json({ error: 'Item not found' });
    return res.status(200).json({ message: 'Item archived', item });
  } catch (error) {
    console.error('deleteItem error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/items/quick-save  (browser extension / share sheet)
export const quickSave = async (req: AuthRequest, res: Response) => {
  try {
    const { url, title } = req.body;
    const userId = req.user!.id;

    if (!url) return res.status(400).json({ error: 'url is required' });
    try { new URL(url); } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const type = detectType(url);
    const domain = extractDomain(url);

    const item = await SavedItem.create({ userId, url, type, domain, title: title ?? undefined, status: 'pending' });

    await itemQueue.add('process-item', {
      itemId: item._id.toString(),
      url,
      type,
      userId,
      existingTitle: !!title,
    });

    // Minimal response for extensions
    return res.status(201).json({ id: item._id, status: 'pending', url: item.url });
  } catch (error) {
    console.error('quickSave error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/items/:id/retry
export const retryItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await SavedItem.findOne({ _id: req.params.id, userId });

    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.status !== 'failed') {
      return res.status(400).json({ error: 'Only failed items can be retried' });
    }

    await Summary.deleteOne({ itemId: item._id });
    await item.updateOne({ status: 'pending' });

    await itemQueue.add('process-item', {
      itemId: item._id.toString(),
      url: item.url,
      type: item.type,
      userId,
      existingTitle: !!item.title,
    });

    return res.status(200).json({ message: 'Retry queued' });
  } catch (error) {
    console.error('retryItem error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
