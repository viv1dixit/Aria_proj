import mongoose, { Schema, Document } from 'mongoose';

export interface ICollection extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  color: string;
  isPublic: boolean;
  createdAt: Date;
}

const collectionSchema = new Schema<ICollection>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 100, trim: true },
    description: { type: String },
    color: { type: String, default: '#6366f1', match: /^#[0-9a-fA-F]{6}$/ },
    isPublic: { type: Boolean, default: false },
  },
  { timestamps: true }
);

collectionSchema.index({ userId: 1 });

export const Collection = mongoose.model<ICollection>('Collection', collectionSchema);
