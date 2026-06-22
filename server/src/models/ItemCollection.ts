import mongoose, { Schema, Document } from 'mongoose';

export interface IItemCollection extends Document {
  itemId: mongoose.Types.ObjectId;
  collectionId: mongoose.Types.ObjectId;
}

const itemCollectionSchema = new Schema<IItemCollection>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'SavedItem', required: true },
    collectionId: { type: Schema.Types.ObjectId, ref: 'Collection', required: true },
  },
  { timestamps: false }
);

itemCollectionSchema.index({ itemId: 1, collectionId: 1 }, { unique: true });
itemCollectionSchema.index({ collectionId: 1 });

export const ItemCollection = mongoose.model<IItemCollection>('ItemCollection', itemCollectionSchema);
