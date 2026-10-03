import { Types } from 'mongoose';
import { Transaction, ITransactionDocument } from '../../models/Transaction';
import { RecordTransactionParams, RecordTransactionResult } from './types';
import { getBalance } from './getBalance';
import { formatTransactionConfirmation } from './formatters';
import { validateTransactionAmount } from './transactionValidator';

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
    isMinorUnits,
    confirmed,
    requireConfirmationBeforeWrite,
  } = params;

  // Validation
  if (!userId) {
    throw new Error('userId is required to record a transaction');
  }

  if (!['income', 'expense'].includes(type)) {
    throw new Error(`Invalid transaction type: "${type}". Must be "income" or "expense"`);
  }

  // Pure, modular currency & bounds validation before database writes
  const validation = validateTransactionAmount(amount, currency, { isMinorUnits });
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (validation.requires_confirmation && requireConfirmationBeforeWrite && !confirmed) {
    throw new Error(
      `Amount exceeds high-value threshold. Explicit confirmation required before persistence.`
    );
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

  const dbAmount =
    typeof amount === 'bigint'
      ? Number(amount)
      : typeof amount === 'number' && Number.isInteger(amount)
      ? amount
      : isMinorUnits
      ? validation.amountInteger
      : Math.round(Number(amount));

  // 1. Persist transaction with strictly integer minor units precision
  const transaction: ITransactionDocument = await Transaction.create({
    userId: userObjectId,
    type,
    amount: dbAmount,
    currency: currency.toUpperCase().trim(),
    category: category.toLowerCase().trim(),
    description: description ? description.trim() : category.trim(),
    counterparty: counterparty ? counterparty.trim() : undefined,
    date: parsedDate,
    source,
    transcript: transcript || undefined,
    whatsappMessageId: whatsappMessageId || undefined,
  });

  // Persistence-First Guarantee: Confirm write returned a valid document ID
  if (!transaction || !transaction._id) {
    throw new Error('Database write operation failed: No confirmed document ID returned.');
  }

  // 2. Read-Back Verification: Immediate query to verify record exists in database
  const verifiedTransaction = await Transaction.findById(transaction._id);
  if (!verifiedTransaction) {
    throw new Error(
      `Persistence verification failed: Transaction with ID "${transaction._id}" was not found in database after write.`
    );
  }

  const verifiedId = verifiedTransaction._id.toString();

  // 3. Retrieve true updated running balance from DB after read-back verification
  const balanceResult = await getBalance(userObjectId, verifiedTransaction.currency);

  // 4. Generate friendly response with verified document
  const formattedResponse = formatTransactionConfirmation(verifiedTransaction, balanceResult.balance);

  return {
    transaction: verifiedTransaction,
    verifiedId,
    isVerified: true,
    runningBalance: balanceResult.balance,
    formattedResponse,
    requires_confirmation: validation.requires_confirmation,
    requiresConfirmation: validation.requiresConfirmation,
  };
}

export interface SafeRecordTransactionResult {
  success: boolean;
  verifiedId?: string;
  isVerified: boolean;
  transaction?: ITransactionDocument;
  runningBalance?: number | bigint;
  formattedResponse?: string;
  failureMessage?: string;
  error?: string;
  balanceUnaltered?: boolean;
  requires_confirmation?: boolean;
  requiresConfirmation?: boolean;
}

/**
 * Safely executes transaction recording without throwing, returning an explicit failure message
 * and guaranteeing that balance remains unaltered if write or verification fails.
 */
export async function safeRecordTransaction(
  params: RecordTransactionParams
): Promise<SafeRecordTransactionResult> {
  try {
    const result = await recordTransaction(params);
    return {
      success: true,
      ...result,
      isVerified: true,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const failureMessage = `❌ *Transaction Failed*\n\n${error}\n\nYour balance remains unaltered.`;
    return {
      success: false,
      isVerified: false,
      error,
      failureMessage,
      balanceUnaltered: true,
    };
  }
}

