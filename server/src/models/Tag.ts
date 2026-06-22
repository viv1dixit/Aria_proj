import mongoose, { Schema, Document } from 'mongoose';

export interface ITag extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  color: string;
}

const tagSchema = new Schema<ITag>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, maxlength: 60, trim: true },
    color: { type: String, default: '#6366f1', match: /^#[0-9a-fA-F]{6}$/ },
  },
  { timestamps: true }
);

tagSchema.index({ userId: 1, name: 1 }, { unique: true });

export const Tag = mongoose.model<ITag>('Tag', tagSchema);
