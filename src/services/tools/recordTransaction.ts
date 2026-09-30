import { Types } from 'mongoose';
import { Transaction, ITransactionDocument } from '../../models/Transaction';
import { RecordTransactionParams, RecordTransactionResult } from './types';
import { getBalance } from './getBalance';
import { formatTransactionConfirmation } from './formatters';

/**
 * Validates and records a financial transaction in MongoDB, then calculates running balance.
 */
export async function recordTransaction(
  params: RecordTransactionParams
): Promise<RecordTransactionResult> {
  const {
    userId,
    type,
    amount,
    currency = 'NGN',
    category,
    description,
    counterparty,
    date,
    source,
    transcript,
    whatsappMessageId,
  } = params;

  // Validation
  if (!userId) {
    throw new Error('userId is required to record a transaction');
  }

  if (!['income', 'expense'].includes(type)) {
    throw new Error(`Invalid transaction type: "${type}". Must be "income" or "expense"`);
  }

  if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
    throw new Error(`Invalid transaction amount: "${amount}". Amount must be a positive number.`);
  }

  if (!category || !category.trim()) {
    throw new Error('Transaction category is required');
  }

  if (!['text', 'voice'].includes(source)) {
    throw new Error(`Invalid transaction source: "${source}". Must be "text" or "voice"`);
  }

  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

  let parsedDate: Date;
  if (!date) {
    parsedDate = new Date();
  } else if (date instanceof Date) {
    parsedDate = date;
  } else {
    // If it's a date string like '2026-09-10', append time or parse safely
    parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      parsedDate = new Date();
    }
  }

  // Persist transaction
  const transaction: ITransactionDocument = await Transaction.create({
    userId: userObjectId,
    type,
    amount,
    currency: currency.toUpperCase().trim(),
    category: category.toLowerCase().trim(),
    description: description ? description.trim() : category.trim(),
    counterparty: counterparty ? counterparty.trim() : undefined,
    date: parsedDate,
    source,
    transcript: transcript || undefined,
    whatsappMessageId: whatsappMessageId || undefined,
  });

  // Calculate new running balance
  const balanceResult = await getBalance(userObjectId, transaction.currency);

  // Generate friendly response
  const formattedResponse = formatTransactionConfirmation(transaction, balanceResult.balance);

  return {
    transaction,
    runningBalance: balanceResult.balance,
    formattedResponse,
  };
}
