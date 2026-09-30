import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { ITransaction } from '../types/models';

export interface ITransactionDocument extends ITransaction, Document {}

const TransactionSchema = new Schema<ITransactionDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      required: [true, 'type is required'],
    },
    amount: {
      type: Number,
      required: [true, 'amount is required'],
      min: [0.01, 'amount must be greater than 0'],
    },
    currency: {
      type: String,
      required: [true, 'currency is required'],
      uppercase: true,
      default: 'NGN',
    },
    category: {
      type: String,
      required: [true, 'category is required'],
      trim: true,
      lowercase: true,
    },
    description: { type: String, trim: true },
    counterparty: { type: String, trim: true },
    date: { type: Date, required: true, default: Date.now },
    source: {
      type: String,
      enum: ['text', 'voice'],
      required: [true, 'source is required'],
    },
    transcript: { type: String },
    whatsappMessageId: {
      type: String,
      sparse: true,
      unique: true,
    },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────
// Primary query pattern: user's transactions sorted by date
TransactionSchema.index({ userId: 1, date: -1 });
// Filter by transaction type (income vs expense)
TransactionSchema.index({ userId: 1, type: 1 });
// Filter by category (category breakdowns)
TransactionSchema.index({ userId: 1, category: 1 });
// Date range queries for period summaries
TransactionSchema.index({ userId: 1, date: -1, type: 1 });

// Virtual for formatted amount (useful for display)
TransactionSchema.virtual('formattedAmount').get(function (this: ITransactionDocument) {
  return `${this.currency} ${this.amount.toLocaleString()}`;
});

export const Transaction: Model<ITransactionDocument> = mongoose.model<ITransactionDocument>(
  'Transaction',
  TransactionSchema
);

// Re-export ObjectId type for convenience in service layer
export { Types };
