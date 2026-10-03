import mongoose, { Schema, Document, Model, Types } from 'mongoose';
import { IInvoice } from '../types/models';

export interface IInvoiceDocument extends IInvoice, Document {
  _id: Types.ObjectId;
}

const InvoiceSchema = new Schema<IInvoiceDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    clientName: {
      type: String,
      required: [true, 'clientName is required'],
      trim: true,
    },
    clientPhone: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'amount is required'],
      min: [1, 'amount must be greater than 0'],
      validate: {
        validator: Number.isInteger,
        message: 'amount must be an integer stored strictly in minor units',
      },
    },
    currency: {
      type: String,
      required: [true, 'currency is required'],
      default: 'NGN',
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    dueDate: {
      type: Date,
      required: [true, 'dueDate is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue'],
      default: 'pending',
      required: true,
      index: true,
    },
    reminderCount: {
      type: Number,
      default: 0,
      min: [0, 'reminderCount cannot be negative'],
    },
    invoiceNumber: {
      type: String,
      trim: true,
    },
    lastReminderSentAt: {
      type: Date,
    },
    paidAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

InvoiceSchema.index({ userId: 1, status: 1 });
InvoiceSchema.index({ userId: 1, dueDate: 1 });

export const Invoice: Model<IInvoiceDocument> =
  (mongoose.models.Invoice as Model<IInvoiceDocument>) ||
  mongoose.model<IInvoiceDocument>('Invoice', InvoiceSchema);

export { Types };
