import { Response } from 'express';
import mongoose from 'mongoose';
import { Conversation } from '../models/Conversation';
import { AuthRequest } from '../middleware/authMiddleware';

export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user!.id);

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    const [conversations, total] = await Promise.all([
      Conversation.find({ participants: userId })
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('participants', 'id name email')
        .populate('lastMessage', 'text createdAt'),
      Conversation.countDocuments({ participants: userId }),
    ]);

    return res.status(200).json({
      conversations,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalConversations: total,
        limit,
      },
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
