import mongoose, { Schema, Document } from 'mongoose';

export interface INote extends Document {
  itemId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new Schema<INote>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'SavedItem', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

noteSchema.index({ itemId: 1 });
noteSchema.index({ userId: 1 });

export const Note = mongoose.model<INote>('Note', noteSchema);
