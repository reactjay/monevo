import mongoose, { Schema, Document, Model } from 'mongoose';
import { IWeeklyReport, ITopCategory } from '../types/models';

export interface IWeeklyReportDocument extends IWeeklyReport, Document {}

const TopCategorySchema = new Schema<ITopCategory>(
  {
    category: { type: String, required: true },
    amount: { type: Number, required: true },
    count: { type: Number, required: true },
  },
  { _id: false }
);

const WeeklyReportSchema = new Schema<IWeeklyReportDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required'],
      index: true,
    },
    weekStart: { type: Date, required: [true, 'weekStart is required'] },
    weekEnd: { type: Date, required: [true, 'weekEnd is required'] },
    totalIncome: { type: Number, required: true, default: 0, min: 0 },
    totalExpenses: { type: Number, required: true, default: 0, min: 0 },
    net: { type: Number, required: true, default: 0 },
    transactionCount: { type: Number, required: true, default: 0, min: 0 },
    topCategories: { type: [TopCategorySchema], default: [] },
    generatedAt: { type: Date, default: Date.now },
    imageReference: { type: String },
  },
  { timestamps: true }
);

// One report per user per week
WeeklyReportSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export const WeeklyReport: Model<IWeeklyReportDocument> = mongoose.model<IWeeklyReportDocument>(
  'WeeklyReport',
  WeeklyReportSchema
);
