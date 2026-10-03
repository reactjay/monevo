import { z } from 'zod';

export const TransactionTypeSchema = z.enum(['income', 'expense']);
export type TransactionType = z.infer<typeof TransactionTypeSchema>;

export const QueryTypeSchema = z.enum([
  'period_summary',
  'category_summary',
  'largest_expense',
  'balance',
  'recent_transactions',
  'income_summary',
  'category_spend',
  'compare_periods',
  'weekly_report',
]);
export type QueryType = z.infer<typeof QueryTypeSchema>;

export const QueryPeriodSchema = z.enum([
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_year',
  'all_time',
]);
export type QueryPeriod = z.infer<typeof QueryPeriodSchema>;

// ── 1. Record Transaction Intent ─────────────────────────────
export const RecordTransactionDetailsSchema = z.object({
  type: TransactionTypeSchema,
  amount: z.number().positive({ message: 'Amount must be greater than 0' }),
  currency: z.string().min(1).default('NGN'),
  category: z.string().min(1),
  description: z.string().min(1),
  counterparty: z.string().nullable().default(null),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' }),
  confirmed: z.boolean().optional(),
});
export type RecordTransactionDetails = z.infer<typeof RecordTransactionDetailsSchema>;

export const RecordTransactionIntentSchema = z.object({
  intent: z.literal('record_transaction'),
  transaction: RecordTransactionDetailsSchema,
});
export type RecordTransactionIntent = z.infer<typeof RecordTransactionIntentSchema>;

// ── 2. Clarification Required Intent ─────────────────────────
export const ClarificationRequiredIntentSchema = z.object({
  intent: z.literal('clarification_required'),
  missing: z.array(z.string()).min(1),
  clarificationPrompt: z.string().optional(),
  partial: z
    .object({
      type: TransactionTypeSchema.optional(),
      category: z.string().optional(),
      description: z.string().optional(),
      counterparty: z.string().nullable().optional(),
      currency: z.string().optional(),
      date: z.string().optional(),
    })
    .optional(),
});
export type ClarificationRequiredIntent = z.infer<typeof ClarificationRequiredIntentSchema>;

// ── 3. Financial Query Intent ────────────────────────────────
export const FinancialQueryIntentSchema = z.object({
  intent: z.literal('financial_query'),
  queryType: QueryTypeSchema,
  period: QueryPeriodSchema.optional(),
  comparePeriod: QueryPeriodSchema.optional(),
  category: z.string().optional(),
});
export type FinancialQueryIntent = z.infer<typeof FinancialQueryIntentSchema>;

// ── 4. Generate Receipt Intent ───────────────────────────────
export const GenerateReceiptDetailsSchema = z.object({
  payer_name: z.string().nullable().optional(),
  counterparty: z.string().nullable().optional(),
  amount: z.number().positive().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' })
    .optional(),
  include_contact_phone: z.boolean().optional(),
});
export type GenerateReceiptDetails = z.infer<typeof GenerateReceiptDetailsSchema>;

export const GenerateReceiptIntentSchema = z.object({
  intent: z.literal('generate_receipt'),
  target: GenerateReceiptDetailsSchema,
});
export type GenerateReceiptIntent = z.infer<typeof GenerateReceiptIntentSchema>;

// ── 5. Profile Update Intent ─────────────────────────────────
export const ProfileUpdateIntentSchema = z.object({
  intent: z.literal('profile_update'),
  fields: z.object({
    name: z.string().optional(),
    currency: z.string().optional(),
    businessName: z.string().optional(),
    businessAddress: z.string().optional(),
    responseMode: z.enum(['text', 'voice']).optional(),
    include_phone_on_receipts: z.boolean().optional(),
  }),
});
export type ProfileUpdateIntent = z.infer<typeof ProfileUpdateIntentSchema>;

// ── 6. Help Intent ───────────────────────────────────────────
export const HelpIntentSchema = z.object({
  intent: z.literal('help'),
});
export type HelpIntent = z.infer<typeof HelpIntentSchema>;

// ── 7. Conversation / Banter / Greeting Intent ──────────────
export const ConversationIntentSchema = z.object({
  intent: z.literal('conversation'),
  reply: z.string(),
});
export type ConversationIntent = z.infer<typeof ConversationIntentSchema>;

// ── 8. Unknown / Unrecognized Intent ─────────────────────────
export const UnknownIntentSchema = z.object({
  intent: z.literal('unknown'),
  rawText: z.string(),
});
export type UnknownIntent = z.infer<typeof UnknownIntentSchema>;

// ── Combined Financial Intent Union ──────────────────────────
export const FinancialIntentSchema = z.discriminatedUnion('intent', [
  RecordTransactionIntentSchema,
  ClarificationRequiredIntentSchema,
  FinancialQueryIntentSchema,
  GenerateReceiptIntentSchema,
  ProfileUpdateIntentSchema,
  HelpIntentSchema,
  ConversationIntentSchema,
  UnknownIntentSchema,
]);
export type FinancialIntent = z.infer<typeof FinancialIntentSchema>;
