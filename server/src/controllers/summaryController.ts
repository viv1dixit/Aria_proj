import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { SavedItem } from '../models/SavedItem';
import { Summary } from '../models/Summary';
import { Tag } from '../models/Tag';
import { ItemTag } from '../models/ItemTag';
import { generateSummaryAndTags } from '../utils/aiSummarizer';

// GET /api/items/:id/summary
export const getSummary = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await SavedItem.findOne({ _id: req.params.id, userId }).lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const summary = await Summary.findOne({ itemId: item._id }).lean();
    if (!summary) return res.status(404).json({ error: 'Summary not yet available' });

    return res.status(200).json({ summary });
  } catch (error) {
    console.error('getSummary error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/items/:id/summary/regenerate
export const regenerateSummary = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await SavedItem.findOne({ _id: req.params.id, userId });
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (!item.rawContent) {
      return res.status(400).json({ error: 'No content available to summarize. Try retrying the item first.' });
    }

    const { bullets, keyQuote, sentiment, tags, tokensUsed } = await generateSummaryAndTags(
      item.rawContent,
      item.type,
      item.title ?? item.url
    );

    const summary = await Summary.findOneAndUpdate(
      { itemId: item._id },
      {
        itemId: item._id,
        bullet1: bullets[0],
        bullet2: bullets[1],
        bullet3: bullets[2],
        keyQuote,
        sentiment,
        modelUsed: 'claude-sonnet-4-6',
        tokensUsed,
        generatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Upsert AI-suggested tags
    for (const tagName of tags) {
      const tag = await Tag.findOneAndUpdate(
        { userId, name: tagName },
        { $setOnInsert: { userId, name: tagName } },
        { upsert: true, new: true }
      );
      await ItemTag.findOneAndUpdate(
        { itemId: item._id, tagId: tag._id },
        { itemId: item._id, tagId: tag._id },
        { upsert: true }
      );
    }

    return res.status(200).json({ summary });
  } catch (error) {
    console.error('regenerateSummary error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
