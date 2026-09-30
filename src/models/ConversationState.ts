import mongoose, { Schema, Document, Model } from 'mongoose';
import { IConversationState } from '../types/models';

export interface IConversationStateDocument extends IConversationState, Document {}

const ConversationStateSchema = new Schema<IConversationStateDocument>(
  {
    whatsappId: {
      type: String,
      required: [true, 'whatsappId is required'],
      unique: true,
      index: true,
      trim: true,
    },
    // Onboarding states: 'new' | 'awaiting_name' | 'awaiting_profile_type' |
    //                    'awaiting_business_name' | 'active' | 'awaiting_clarification'
    state: {
      type: String,
      required: [true, 'state is required'],
      default: 'new',
    },
    // Holds partial onboarding data or pending clarification context
    context: {
      type: Schema.Types.Mixed,
      default: {},
    },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

// TTL index: automatically delete expired conversation states
ConversationStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

export const ConversationState: Model<IConversationStateDocument> =
  mongoose.model<IConversationStateDocument>('ConversationState', ConversationStateSchema);
