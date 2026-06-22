import mongoose, { Schema, Document } from 'mongoose';

export interface ISummary extends Document {
  itemId: mongoose.Types.ObjectId;
  bullet1: string;
  bullet2: string;
  bullet3: string;
  keyQuote?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'mixed';
  modelUsed?: string;
  tokensUsed?: number;
  generatedAt: Date;
}

const summarySchema = new Schema<ISummary>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: 'SavedItem', required: true },
    bullet1: { type: String, required: true },
    bullet2: { type: String, required: true },
    bullet3: { type: String, required: true },
    keyQuote: { type: String },
    sentiment: { type: String, enum: ['positive', 'neutral', 'negative', 'mixed'] },
    modelUsed: { type: String },
    tokensUsed: { type: Number },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

summarySchema.index({ itemId: 1 }, { unique: true });

export const Summary = mongoose.model<ISummary>('Summary', summarySchema);
