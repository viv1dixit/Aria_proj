import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { SavedItem } from '../models/SavedItem';
import { ItemTag } from '../models/ItemTag';
import { Tag } from '../models/Tag';

// GET /api/stats
export const getStats = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const [totalSaved, totalRead, totalStarred, totalArchived, statusBreakdown, readTimeSaved, topTagsRaw] =
      await Promise.all([
        SavedItem.countDocuments({ userId }),
        SavedItem.countDocuments({ userId, isRead: true }),
        SavedItem.countDocuments({ userId, isStarred: true }),
        SavedItem.countDocuments({ userId, isArchived: true }),
        SavedItem.aggregate([
          { $match: { userId: userId } },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]),
        // Total read time saved = sum of readTimeMin for items with status='done'
        SavedItem.aggregate([
          { $match: { userId: userId, status: 'done' } },
          { $group: { _id: null, total: { $sum: '$readTimeMin' } } },
        ]),
        // Top 10 tags by item count
        ItemTag.aggregate([
          {
            $lookup: {
              from: 'tags',
              localField: 'tagId',
              foreignField: '_id',
              as: 'tag',
            },
          },
          { $unwind: '$tag' },
          { $match: { 'tag.userId': userId } },
          { $group: { _id: '$tagId', name: { $first: '$tag.name' }, color: { $first: '$tag.color' }, count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ]),
      ]);

    const statusMap: Record<string, number> = {};
    for (const s of statusBreakdown) statusMap[s._id] = s.count;

    const topTags = topTagsRaw.map((t) => ({ id: t._id, name: t.name, color: t.color, itemCount: t.count }));

    return res.status(200).json({
      stats: {
        totalSaved,
        totalRead,
        totalStarred,
        totalArchived,
        totalPending: statusMap['pending'] ?? 0,
        totalProcessing: statusMap['processing'] ?? 0,
        totalDone: statusMap['done'] ?? 0,
        totalFailed: statusMap['failed'] ?? 0,
        totalReadTimeMinSaved: readTimeSaved[0]?.total ?? 0,
        topTags,
      },
    });
  } catch (error) {
    console.error('getStats error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
