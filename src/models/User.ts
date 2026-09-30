import mongoose, { Schema, Document, Model } from 'mongoose';
import { IUser } from '../types/models';

export interface IUserDocument extends IUser, Document {}

const UserSchema = new Schema<IUserDocument>(
  {
    whatsappId: {
      type: String,
      required: [true, 'whatsappId is required'],
      unique: true,
      index: true,
      trim: true,
    },
    profileType: {
      type: String,
      enum: ['personal', 'business'],
      default: 'personal',
      required: [true, 'profileType is required'],
    },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    businessName: { type: String, trim: true },
    businessAddress: { type: String, trim: true },
    currency: { type: String, default: 'NGN', uppercase: true },
    onboardingComplete: { type: Boolean, default: false },
    weeklyReportsEnabled: { type: Boolean, default: true },
    responseMode: { type: String, enum: ['text', 'voice'], default: 'text' },
  },
  { timestamps: true }
);

export const User: Model<IUserDocument> = mongoose.model<IUserDocument>('User', UserSchema);
