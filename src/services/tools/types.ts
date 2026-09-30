import { Types } from 'mongoose';
import { ITransactionDocument } from '../../models/Transaction';
import { IUserDocument } from '../../models/User';
import { QueryPeriod, TransactionType } from '../ai/schemas';

export interface RecordTransactionParams {
  userId: Types.ObjectId | string;
  type: TransactionType;
  amount: number;
  currency?: string;
  category: string;
  description?: string;
  counterparty?: string | null;
  date?: string | Date;
  source: 'text' | 'voice';
  transcript?: string;
  whatsappMessageId?: string;
}

export interface RecordTransactionResult {
  transaction: ITransactionDocument;
  runningBalance: number;
  formattedResponse: string;
}

export interface BalanceResult {
  balance: number;
  totalIncome: number;
  totalExpenses: number;
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
