import { Types } from 'mongoose';
import { ITransactionDocument } from '../../models/Transaction';
import { IUserDocument } from '../../models/User';
import { QueryPeriod, TransactionType } from '../ai/schemas';

export interface RecordTransactionParams {
  userId: Types.ObjectId | string;
  type: TransactionType;
  amount: number | bigint | string;
  currency?: string;
  category: string;
  description?: string;
  counterparty?: string | null;
  date?: string | Date;
  source: 'text' | 'voice';
  transcript?: string;
  whatsappMessageId?: string;
  isMinorUnits?: boolean;
  confirmed?: boolean;
  requireConfirmationBeforeWrite?: boolean;
}

export interface RecordTransactionResult {
  transaction: ITransactionDocument;
  verifiedId: string;
  isVerified: boolean;
  runningBalance: number | bigint;
  formattedResponse: string;
  requires_confirmation?: boolean;
  requiresConfirmation?: boolean;
}

export interface BalanceResult {
  balance: number | bigint;
  balanceBigInt?: bigint;
  totalIncome: number | bigint;
  totalExpenses: number | bigint;
  currency: string;
  transactionCount: number;
}


export interface CategorySummaryItem {
  category: string;
  totalAmount: number;
  count: number;
  percentage?: number;
}

export interface PeriodSummaryResult {
  period: QueryPeriod | string;
  startDate: Date;
  endDate: Date;
  totalIncome: number;
  totalExpenses: number;
  net: number;
  transactionCount: number;
  topCategory?: {
    name: string;
    amount: number;
  } | null;
  categories: CategorySummaryItem[];
}

export interface GetTransactionsFilter {
  userId: Types.ObjectId | string;
  type?: TransactionType;
  category?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface ToolContext {
  user: IUserDocument;
  whatsappMessageId?: string;
  source: 'text' | 'voice';
  transcript?: string;
}
