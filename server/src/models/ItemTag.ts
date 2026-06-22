import mongoose, { Schema, Document } from 'mongoose';

export interface IItemTag extends Document {
  itemId: mongoose.Types.ObjectId;
  tagId: mongoose.Types.ObjectId;
}

const itemTagSchema = new Schema<IItemTag>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'SavedItem', required: true },
    tagId: { type: Schema.Types.ObjectId, ref: 'Tag', required: true },
  },
  { timestamps: false }
);

itemTagSchema.index({ itemId: 1, tagId: 1 }, { unique: true });
itemTagSchema.index({ tagId: 1 });

export const ItemTag = mongoose.model<IItemTag>('ItemTag', itemTagSchema);
