import mongoose, { Schema, Document, Model } from 'mongoose';
import { IReceipt } from '../types/models';

export interface IReceiptDocument extends IReceipt, Document {}

const ReceiptSchema = new Schema<IReceiptDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      required: [true, 'transactionId is required'],
    },
    receiptNumber: {
      type: String,
      required: [true, 'receiptNumber is required'],
      unique: true,
      trim: true,
    },
    payer: { type: String, trim: true },
    recipient: { type: String, trim: true },
    amount: {
      type: Number,
      required: [true, 'amount is required'],
      min: [0, 'amount must be non-negative'],
    },
    currency: {
      type: String,
      required: [true, 'currency is required'],
      uppercase: true,
    },
    description: { type: String, trim: true },
    issuedAt: { type: Date, default: Date.now },
    imagePath: { type: String },
    mediaReference: { type: String },
  },
  { timestamps: true }
);

export const Receipt: Model<IReceiptDocument> = mongoose.model<IReceiptDocument>(
  'Receipt',
  ReceiptSchema
);
