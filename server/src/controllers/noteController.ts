import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { Note } from '../models/Note';
import { SavedItem } from '../models/SavedItem';

// GET /api/items/:id/notes
export const listNotes = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await SavedItem.findOne({ _id: req.params.id, userId }).lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const notes = await Note.find({ itemId: item._id, userId }).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ notes });
  } catch (error) {
    console.error('listNotes error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// POST /api/items/:id/notes
export const createNote = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const item = await SavedItem.findOne({ _id: req.params.id, userId }).lean();
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const note = await Note.create({ itemId: item._id, userId, content });
    return res.status(201).json({ note });
  } catch (error) {
    console.error('createNote error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/notes/:id
export const updateNote = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });

    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, userId },
      { $set: { content } },
      { new: true }
    );
    if (!note) return res.status(404).json({ error: 'Note not found' });
    return res.status(200).json({ note });
  } catch (error) {
    console.error('updateNote error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/notes/:id
export const deleteNote = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const note = await Note.findOneAndDelete({ _id: req.params.id, userId });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    return res.status(200).json({ message: 'Note deleted' });
  } catch (error) {
    console.error('deleteNote error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
