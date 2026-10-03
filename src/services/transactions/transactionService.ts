import { Types } from 'mongoose';
import { Transaction, ITransactionDocument } from '../../models/Transaction';
import { convertToMajorUnits } from '../tools/transactionValidator';
import { formatCurrency } from '../tools/formatters';
import { formatDateToYYYYMMDD } from '../ai/dateParser';

export type TimeframePeriod = 'daily' | 'weekly' | 'monthly';

export interface TimeframeQueryOptions {
  referenceDate?: Date;
  timezone?: string;
}

export interface EnrichedTransactionRecord {
  id: string;
  _id: Types.ObjectId | string;
  amount: number; // formatted to major units from minor units/kobo
  amountMinor: number; // raw minor units stored in DB
  currency: string;
  category: string;
  rawInput: string; // original raw input text / transcript snippet (if captured)
  transcript?: string;
  description?: string;
  date: Date;
  type: 'income' | 'expense';
  source?: 'text' | 'voice';
  counterparty?: string;
}

export interface FormatTransactionsOptions {
  currency?: string;
  timezone?: string;
  header?: string;
}

/**
 * Capitalizes the first letter of each word in a string.
 */
function capitalizeWords(str: string): string {
  if (!str) return '';
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Formats a Date to [DD/MM] string for WhatsApp chat line items.
 */
export function formatLineDate(date: Date | string, timezone: string = 'UTC'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '[--/--]';

  if (timezone === 'UTC') {
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `[${day}/${month}]`;
  }

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
    }).formatToParts(d);
    const day = parts.find((p) => p.type === 'day')?.value || String(d.getDate()).padStart(2, '0');
    const month = parts.find((p) => p.type === 'month')?.value || String(d.getMonth() + 1).padStart(2, '0');
    return `[${day}/${month}]`;
  } catch {
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `[${day}/${month}]`;
  }
}

/**
 * Calculates start and end Date objects for a given timeframe period.
 */
export function calculateTimeframeBounds(
  period: TimeframePeriod,
  options: TimeframeQueryOptions = {}
): { startDate: Date; endDate: Date } {
  const refDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const timezone = options.timezone || 'UTC';

  let startOfToday: Date;
  let endOfToday: Date;

  if (timezone === 'UTC') {
    startOfToday = new Date(
      Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate(), 0, 0, 0, 0)
    );
    endOfToday = new Date(
      Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate(), 23, 59, 59, 999)
    );
  } else {
    try {
      const dateStr = formatDateToYYYYMMDD(refDate, timezone);
      const [y, m, d] = dateStr.split('-').map(Number);
      startOfToday = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
      endOfToday = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
    } catch {
      startOfToday = new Date(
        Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate(), 0, 0, 0, 0)
      );
      endOfToday = new Date(
        Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate(), 23, 59, 59, 999)
      );
    }
  }

  const endDate = options.referenceDate
    ? new Date(Math.max(refDate.getTime(), endOfToday.getTime()))
    : new Date();

  switch (period) {
    case 'daily': {
      // 'daily': Transactions created from start of today (00:00:00 UTC/user timezone) to now.
      return {
        startDate: startOfToday,
        endDate,
      };
    }
    case 'weekly': {
      // 'weekly': Transactions created in the last 7 calendar days.
      const startDate = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
      return {
        startDate,
        endDate,
      };
    }
    case 'monthly': {
      // 'monthly': Transactions created in the last 30 calendar days.
      const startDate = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);
      return {
        startDate,
        endDate,
      };
    }
  }
}

/**
 * Returns standard header text for a given timeframe period.
 */
export function getHeaderForPeriod(period: TimeframePeriod): string {
  switch (period) {
    case 'daily':
      return '📅 *Transactions (Today)*';
    case 'weekly':
      return '📅 *Transactions (Last 7 Days)*';
    case 'monthly':
      return '📅 *Transactions (Last 30 Days)*';
  }
}

/**
 * Retrieves raw transaction records filtered by timeframe ('daily' | 'weekly' | 'monthly')
 * and enriches them with major units amount and original notes/transcripts for auditability.
 */
export async function getTransactionsByTimeframe(
  userId: string | Types.ObjectId,
  period: TimeframePeriod,
  options: TimeframeQueryOptions = {}
): Promise<EnrichedTransactionRecord[]> {
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  const { startDate, endDate } = calculateTimeframeBounds(period, options);

  const docs: ITransactionDocument[] = await Transaction.find({
    userId: userObjectId,
    date: { $gte: startDate, $lte: endDate },
  })
    .sort({ date: -1 })
    .exec();

  return docs.map((doc) => {
    const majorAmount = convertToMajorUnits(doc.amount, doc.currency);
    const rawInput = doc.transcript || doc.description || doc.category || '';

    return {
      id: doc._id.toString(),
      _id: doc._id,
      amount: majorAmount,
      amountMinor: Number(doc.amount),
      currency: (doc.currency || 'NGN').toUpperCase().trim(),
      category: doc.category,
      rawInput,
      transcript: doc.transcript || undefined,
      description: doc.description || undefined,
      date: doc.date,
      type: doc.type,
      source: doc.source,
      counterparty: doc.counterparty || undefined,
    };
  });
}

/**
 * Formats a list of enriched transactions for WhatsApp chat display:
 * - Header: e.g. "📅 *Transactions (Last 7 Days)*"
 * - Line Items: "• [DD/MM] ₦X,XXX — Category (\"original note/transcript\")"
 * - Footer Summary: Total In, Total Out, and Net Balance for the filtered window.
 * - Empty State: "No transactions recorded for this period."
 */
export function formatTransactionsChat(
  records: EnrichedTransactionRecord[],
  period: TimeframePeriod,
  options: FormatTransactionsOptions = {}
): string {
  if (!records || records.length === 0) {
    return 'No transactions recorded for this period.';
  }

  const defaultCurrency = options.currency || records[0]?.currency || 'NGN';
  const tz = options.timezone || 'UTC';
  const header = options.header || getHeaderForPeriod(period);

  let totalIn = 0;
  let totalOut = 0;

  const lineItems = records.map((rec) => {
    if (rec.type === 'income') {
      totalIn += rec.amount;
    } else {
      totalOut += rec.amount;
    }

    const dateStr = formatLineDate(rec.date, tz);
    const formattedAmt = formatCurrency(rec.amount, rec.currency || defaultCurrency);
    const categoryLabel = capitalizeWords(rec.category);

    const snippet = rec.rawInput || rec.transcript || rec.description;
    const notePart = snippet ? ` ("${snippet}")` : '';

    return `• ${dateStr} ${formattedAmt} — ${categoryLabel}${notePart}`;
  });

  const netBalance = totalIn - totalOut;

  const lines = [
    header,
    '',
    ...lineItems,
    '',
    `Total In: ${formatCurrency(totalIn, defaultCurrency)}`,
    `Total Out: ${formatCurrency(totalOut, defaultCurrency)}`,
    `Net Balance: ${formatCurrency(netBalance, defaultCurrency)}`,
  ];

  return lines.join('\n');
}

/**
 * Alias for formatTransactionsChat.
 */
export const formatTransactionsByTimeframe = formatTransactionsChat;

/**
 * Convenient helper to fetch and format timeframe transaction report in a single call.
 */
export async function getTimeframeTransactionReport(
  userId: string | Types.ObjectId,
  period: TimeframePeriod,
  options: TimeframeQueryOptions & FormatTransactionsOptions = {}
): Promise<{
  records: EnrichedTransactionRecord[];
  formatted: string;
  summary: {
    totalIn: number;
    totalOut: number;
    netBalance: number;
  };
}> {
  const records = await getTransactionsByTimeframe(userId, period, options);
  const formatted = formatTransactionsChat(records, period, options);

  let totalIn = 0;
  let totalOut = 0;
  for (const rec of records) {
    if (rec.type === 'income') {
      totalIn += rec.amount;
    } else {
      totalOut += rec.amount;
    }
  }

  return {
    records,
    formatted,
    summary: {
      totalIn,
      totalOut,
      netBalance: totalIn - totalOut,
    },
  };
}
