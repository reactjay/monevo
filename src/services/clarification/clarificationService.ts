import { ConversationState } from '../../models/ConversationState';
import { IUserDocument } from '../../models/User';
import { extractAmount } from '../ai/amountParser';
import { recordTransaction } from '../tools/recordTransaction';
import { formatCurrency, capitalizeWords } from '../tools/formatters';
import { ToolContext } from '../tools/types';

export const CLARIFICATION_STATE = 'AWAITING_CLARIFICATION';
export const CLARIFICATION_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes TTL

export interface ClarificationPartialData {
  type?: 'income' | 'expense';
  category?: string;
  description?: string;
  counterparty?: string | null;
  currency?: string;
  date?: string;
}

export interface ClarificationContext {
  pendingClarification: boolean;
  partial: ClarificationPartialData;
  missing: string[];
}

/**
 * Saves a pending clarification state in MongoDB so the bot remembers transaction context across turns.
 */
export async function saveClarificationState(
  whatsappId: string,
  partial: ClarificationPartialData = {},
  missing: string[] = ['amount']
): Promise<void> {
  const expiresAt = new Date(Date.now() + CLARIFICATION_EXPIRY_MS);

  await ConversationState.findOneAndUpdate(
    { whatsappId },
    {
      $set: {
        state: CLARIFICATION_STATE,
        context: {
          pendingClarification: true,
          partial,
          missing,
        },
        expiresAt,
      },
    },
    { upsert: true, returnDocument: 'after' }
  ).exec();
}

/**
 * Retrieves any active, non-expired clarification state for the user.
 */
export async function getClarificationState(
  whatsappId: string
): Promise<ClarificationContext | null> {
  const stateDoc = await ConversationState.findOne({
    whatsappId,
    state: CLARIFICATION_STATE,
  }).exec();

  if (!stateDoc || !stateDoc.context) {
    return null;
  }

  // Check expiration
  if (stateDoc.expiresAt && stateDoc.expiresAt.getTime() < Date.now()) {
    await clearClarificationState(whatsappId);
    return null;
  }

  return stateDoc.context as unknown as ClarificationContext;
}

/**
 * Clears clarification state and restores user conversation state to COMPLETED.
 */
export async function clearClarificationState(whatsappId: string): Promise<void> {
  await ConversationState.findOneAndUpdate(
    { whatsappId },
    {
      $set: {
        state: 'COMPLETED',
        context: {},
      },
      $unset: { expiresAt: 1 },
    }
  ).exec();
}

/**
 * Handles incoming user response when the user is in AWAITING_CLARIFICATION state.
 * Returns a response message if handled, or null if not in clarification state.
 */
export async function handleClarificationResponse(
  user: IUserDocument,
  text: string,
  context: ToolContext
): Promise<string | null> {
  const clarificationState = await getClarificationState(user.whatsappId);
  if (!clarificationState || !clarificationState.pendingClarification) {
    return null;
  }

  const cleanText = text.trim();
  const lower = cleanText.toLowerCase();

  // Check for cancellation
  if (/^(cancel|nevermind|forget it|stop|no)\b/i.test(lower)) {
    await clearClarificationState(user.whatsappId);
    return 'Transaction cancelled. You can record a new transaction anytime!';
  }

  const userCurrency = user.currency || 'NGN';
  const amountData = extractAmount(cleanText, userCurrency);

  if (!amountData || amountData.amount <= 0) {
    // Re-prompt for amount
    const cat = clarificationState.partial?.category;
    return cat
      ? `I still need the amount for ${cat}. How much was it? (e.g. "8000" or "8k")`
      : 'Please tell me the amount for this transaction (e.g. "8000" or "8k").';
  }

  // Merge partial data with extracted amount
  const partial = clarificationState.partial || {};
  const transactionType = partial.type || 'expense';
  const category = partial.category || 'general';
  const description = partial.description || category;
  const currency = amountData.currency || partial.currency || userCurrency;
  const counterparty = partial.counterparty;
  const date = partial.date || new Date();

  // Record transaction
  const result = await recordTransaction({
    userId: user._id,
    type: transactionType,
    amount: amountData.amount,
    currency,
    category,
    description,
    counterparty,
    date,
    source: context.source,
    transcript: context.transcript,
    whatsappMessageId: context.whatsappMessageId,
  });

  // Clear clarification state
  await clearClarificationState(user.whatsappId);

  // Return conversational confirmation
  const formattedAmt = formatCurrency(amountData.amount, currency);
  const formattedBal = formatCurrency(result.runningBalance, currency);
  const categoryLabel = capitalizeWords(category);

  return (
    `Got it. I've recorded ${formattedAmt} for ${categoryLabel} today.\n\n` +
    `Your running balance is ${formattedBal}.`
  );
}
