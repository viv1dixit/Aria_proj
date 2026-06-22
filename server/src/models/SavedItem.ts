import mongoose, { Schema, Document } from 'mongoose';

export interface ISavedItem extends Document {
  userId: mongoose.Types.ObjectId;
  url: string;
  type: 'article' | 'youtube' | 'unknown';
  title?: string;
  author?: string;
  ogImage?: string;
  favicon?: string;
  domain?: string;
  wordCount?: number;
  readTimeMin?: number;
  rawContent?: string;
  status: 'pending' | 'processing' | 'done' | 'failed';
  isRead: boolean;
  isStarred: boolean;
  isArchived: boolean;
  readingProgress: number;
  createdAt: Date;
  updatedAt: Date;
}

const savedItemSchema = new Schema<ISavedItem>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ['article', 'youtube', 'unknown'], required: true },
    title: { type: String },
    author: { type: String },
    ogImage: { type: String },
    favicon: { type: String },
    domain: { type: String },
    wordCount: { type: Number },
    readTimeMin: { type: Number },
    rawContent: { type: String },
    status: {
      type: String,
      enum: ['pending', 'processing', 'done', 'failed'],
      default: 'pending',
      required: true,
    },
    isRead: { type: Boolean, default: false },
    isStarred: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    readingProgress: { type: Number, default: 0, min: 0, max: 100 },
  },
  { timestamps: true }
);

savedItemSchema.index({ userId: 1, createdAt: -1 });
savedItemSchema.index({ userId: 1, status: 1 });
savedItemSchema.index({ userId: 1, isArchived: 1 });
savedItemSchema.index({ userId: 1, isStarred: 1 });

export const SavedItem = mongoose.model<ISavedItem>('SavedItem', savedItemSchema);
