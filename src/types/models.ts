import { Types } from 'mongoose';

// ── Transaction categories ────────────────────────────────────
// Defined as constants, not schema enums, so the category system stays extensible.
// The application validates against these; the database stores any non-empty string.

export const INCOME_CATEGORIES = [
  'sales',
  'salary',
  'freelance',
  'payment',
  'transfer',
  'investment',
  'other',
] as const;

export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'fuel',
  'rent',
  'utilities',
  'inventory',
  'salary',
  'marketing',
  'business',
  'entertainment',
  'health',
  'education',
  'shopping',
  'transfer',
  'other',
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type TransactionCategory = IncomeCategory | ExpenseCategory;

// ── Model interfaces ──────────────────────────────────────────

export interface IUser {
  whatsappId: string;
  profileType: 'personal' | 'business';
  name?: string;
  phone?: string;
  businessName?: string;
  businessAddress?: string;
  currency: string;
  onboardingComplete: boolean;
  weeklyReportsEnabled?: boolean;
  responseMode?: 'text' | 'voice';
  createdAt: Date;
  updatedAt: Date;
}

export interface ITransaction {
  userId: Types.ObjectId;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  category: string;
  description?: string;
  counterparty?: string;
  date: Date;
  source: 'text' | 'voice';
  transcript?: string;
  whatsappMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReceipt {
  userId: Types.ObjectId;
  transactionId: Types.ObjectId;
  receiptNumber: string;
  payer?: string;
  recipient?: string;
  amount: number;
  currency: string;
  description?: string;
  issuedAt: Date;
  imagePath?: string;
  mediaReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationState {
  whatsappId: string;
  state: string;
  context: Record<string, unknown>;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITopCategory {
  category: string;
  amount: number;
  count: number;
}

export interface IWeeklyReport {
  userId: Types.ObjectId;
  weekStart: Date;
  weekEnd: Date;
  totalIncome: number;
  totalExpenses: number;
  net: number;
  transactionCount: number;
  topCategories: ITopCategory[];
  generatedAt: Date;
  imageReference?: string;
  createdAt: Date;
  updatedAt: Date;
}
