import { ITransactionDocument } from '../../models/Transaction';
import { BalanceResult, CategorySummaryItem, PeriodSummaryResult } from './types';
import { formatDateToYYYYMMDD } from '../ai/dateParser';

export const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦',
  USD: '$',
  GBP: '£',
  EUR: '€',
  CAD: 'CA$',
  AUD: 'AU$',
  GHS: 'GH₵',
  KES: 'KSh',
  ZAR: 'R',
};

/**
 * Formats a numeric amount with commas and the appropriate currency symbol.
 */
export function formatCurrency(amount: number, currency = 'NGN'): string {
  const normCurrency = (currency || 'NGN').toUpperCase().trim();
  const symbol = CURRENCY_SYMBOLS[normCurrency];
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const formattedNum = absAmount.toLocaleString('en-US', {
    minimumFractionDigits: absAmount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  const sign = isNegative ? '-' : '';
  if (symbol) {
    return `${sign}${symbol}${formattedNum}`;
  }
  return `${sign}${normCurrency} ${formattedNum}`;
}

/**
 * Formats a Date or date string to friendly text: Today, Yesterday, or Month Day.
 */
export function formatFriendlyDate(
  dateInput: Date | string,
  referenceDate: Date = new Date(),
  timezone = 'Africa/Lagos'
): string {
  const targetDate = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const targetStr = formatDateToYYYYMMDD(targetDate, timezone);
  const todayStr = formatDateToYYYYMMDD(referenceDate, timezone);

  const refDay = new Date(referenceDate);
  refDay.setDate(refDay.getDate() - 1);
  const yesterdayStr = formatDateToYYYYMMDD(refDay, timezone);

  if (targetStr === todayStr) {
    return 'Today';
  }
  if (targetStr === yesterdayStr) {
    return 'Yesterday';
  }

  // Format as readable date e.g. "10 Sep 2026"
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return formatter.format(targetDate);
  } catch {
    return targetStr;
  }
}

/**
 * Capitalizes the first letter of each word in a string.
 */
export function capitalizeWords(text: string): string {
  if (!text) return '';
  return text
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Formats a human-readable period label (e.g., "this week", "today").
 */
export function formatPeriodLabel(period: string): string {
  return period.replace(/_/g, ' ');
}

/**
 * Generates the WhatsApp confirmation message after recording a transaction.
 */
export function formatTransactionConfirmation(
  transaction: ITransactionDocument,
  runningBalance: number
): string {
  const isIncome = transaction.type === 'income';
  const header = isIncome ? '✅ Income recorded' : '✅ Expense recorded';
  const formattedAmount = formatCurrency(transaction.amount, transaction.currency);
  const categoryLabel = capitalizeWords(transaction.category);
  const friendlyDate = formatFriendlyDate(transaction.date);

  const lines: string[] = [header, '', `Amount: ${formattedAmount}`, `Category: ${categoryLabel}`];

  if (transaction.counterparty) {
    const counterpartyLabel = isIncome ? 'From' : 'To';
    lines.push(`${counterpartyLabel}: ${transaction.counterparty}`);
  }

  if (transaction.description && transaction.description.toLowerCase() !== transaction.category.toLowerCase()) {
    lines.push(`Description: ${transaction.description}`);
  }

  lines.push(`Date: ${friendlyDate}`);
  lines.push('');
  lines.push(`Your running balance is ${formatCurrency(runningBalance, transaction.currency)}.`);

  return lines.join('\n');
}

/**
 * Formats a period summary message for WhatsApp.
 */
export function formatPeriodSummary(
  summary: PeriodSummaryResult,
  currency = 'NGN'
): string {
  const periodLabel = formatPeriodLabel(summary.period);

  if (summary.transactionCount === 0) {
    return `You have no recorded transactions for ${periodLabel}.`;
  }

  const lines: string[] = [];

  // If there are only expenses or user queried expenses
  if (summary.totalIncome === 0 && summary.totalExpenses > 0) {
    lines.push(`You spent ${formatCurrency(summary.totalExpenses, currency)} ${periodLabel}.`);
  } else if (summary.totalExpenses === 0 && summary.totalIncome > 0) {
    lines.push(`You earned ${formatCurrency(summary.totalIncome, currency)} ${periodLabel}.`);
  } else {
    lines.push(`📊 Financial Summary (${capitalizeWords(periodLabel)}):`);
    lines.push(`📈 Total Income: ${formatCurrency(summary.totalIncome, currency)}`);
    lines.push(`📉 Total Expenses: ${formatCurrency(summary.totalExpenses, currency)}`);
    const netSign = summary.net >= 0 ? '+' : '';
    lines.push(`💰 Net: ${netSign}${formatCurrency(summary.net, currency)}`);
  }

  if (summary.topCategory) {
    lines.push('');
    lines.push(
      `Your biggest spending category was ${capitalizeWords(summary.topCategory.name)} at ${formatCurrency(summary.topCategory.amount, currency)}.`
    );
  }

  lines.push('');
  lines.push(
    `You recorded ${summary.transactionCount} transaction${summary.transactionCount === 1 ? '' : 's'}.`
  );

  return lines.join('\n');
}

/**
 * Formats a category summary message for WhatsApp.
 */
export function formatCategorySummary(
  categories: CategorySummaryItem[],
  period: string = 'this_month',
  currency = 'NGN'
): string {
  const periodLabel = formatPeriodLabel(period);

  if (!categories || categories.length === 0) {
    return `You have no recorded category expenses for ${periodLabel}.`;
  }

  const lines: string[] = [`📊 Category Breakdown (${capitalizeWords(periodLabel)}):`, ''];

  for (const item of categories) {
    lines.push(`${capitalizeWords(item.category)}: ${formatCurrency(item.totalAmount, currency)}`);
  }

  return lines.join('\n');
}

/**
 * Formats the largest expense response for WhatsApp.
 */
export function formatLargestExpense(
  expense: ITransactionDocument | null,
  period: string = 'this_month',
  currency = 'NGN'
): string {
  const periodLabel = formatPeriodLabel(period);

  if (!expense) {
    return `You have no recorded expenses for ${periodLabel}.`;
  }

  const formattedAmount = formatCurrency(expense.amount, expense.currency || currency);
  const categoryLabel = capitalizeWords(expense.category);
  const friendlyDate = formatFriendlyDate(expense.date);

  return `Your largest expense ${periodLabel} was ${formattedAmount} for ${categoryLabel} on ${friendlyDate}.`;
}

/**
 * Formats the user balance overview for WhatsApp.
 */
export function formatBalance(balance: BalanceResult): string {
  const lines: string[] = [
    '💰 Balance Overview',
    '',
    `Running Balance: ${formatCurrency(balance.balance, balance.currency)}`,
    `Total Income: ${formatCurrency(balance.totalIncome, balance.currency)}`,
    `Total Expenses: ${formatCurrency(balance.totalExpenses, balance.currency)}`,
    '',
    `Total Transactions: ${balance.transactionCount}`,
  ];

  return lines.join('\n');
}

/**
 * Formats a comprehensive period analytics report for WhatsApp.
 */
export function formatComprehensiveAnalytics(
  analytics: {
    period: string;
    totalIncome: number;
    totalExpenses: number;
    netBalance: number;
    transactionCount: number;
    averageExpense: number;
    largestExpense: ITransactionDocument | null;
    topCategories: { category: string; totalAmount: number; percentage: number }[];
  },
  currency = 'NGN'
): string {
  const periodLabel = formatPeriodLabel(analytics.period);

  if (analytics.transactionCount === 0) {
    return `You have no recorded transactions for ${periodLabel}.`;
  }

  const lines: string[] = [
    `📊 *${capitalizeWords(periodLabel)}*`,
    '',
    `Income: ${formatCurrency(analytics.totalIncome, currency)}`,
    `Expenses: ${formatCurrency(analytics.totalExpenses, currency)}`,
    `Net: ${formatCurrency(analytics.netBalance, currency)}`,
    '',
    `Transactions: ${analytics.transactionCount}`,
  ];

  if (analytics.totalExpenses > 0) {
    lines.push(`Average Expense: ${formatCurrency(analytics.averageExpense, currency)}`);
  }

  if (analytics.largestExpense) {
    const largestAmt = formatCurrency(analytics.largestExpense.amount, currency);
    const largestCat = capitalizeWords(analytics.largestExpense.category);
    lines.push(`Largest Expense: ${largestAmt} (${largestCat})`);
  }

  if (analytics.topCategories.length > 0) {
    lines.push('');
    lines.push('Top spending:');
    analytics.topCategories.slice(0, 3).forEach((item, index) => {
      const amtStr = formatCurrency(item.totalAmount, currency);
      const pctStr = item.percentage > 0 ? ` (${item.percentage.toFixed(1)}%)` : '';
      lines.push(`${index + 1}. ${capitalizeWords(item.category)}: ${amtStr}${pctStr}`);
    });
  }

  return lines.join('\n');
}

/**
 * Formats category-specific spend analytics for WhatsApp.
 */
export function formatCategorySpendAnalytics(
  analytics: {
    category: string;
    period: string;
    totalAmount: number;
    transactionCount: number;
    averageAmount: number;
    largestTransaction: ITransactionDocument | null;
  },
  currency = 'NGN'
): string {
  const periodLabel = formatPeriodLabel(analytics.period);
  const categoryLabel = capitalizeWords(analytics.category);

  if (analytics.transactionCount === 0) {
    return `You have no recorded ${categoryLabel} expenses for ${periodLabel}.`;
  }

  const lines: string[] = [
    `🛒 *${categoryLabel} Spending (${capitalizeWords(periodLabel)})*`,
    '',
    `Total: ${formatCurrency(analytics.totalAmount, currency)}`,
    `Transactions: ${analytics.transactionCount}`,
    `Average: ${formatCurrency(analytics.averageAmount, currency)}`,
  ];

  if (analytics.largestTransaction) {
    const formattedAmt = formatCurrency(analytics.largestTransaction.amount, currency);
    const friendlyDate = formatFriendlyDate(analytics.largestTransaction.date);
    lines.push(`Largest: ${formattedAmt} on ${friendlyDate}`);
  }

  return lines.join('\n');
}

/**
 * Formats income-specific summary for WhatsApp.
 */
export function formatIncomeSummary(
  analytics: {
    period: string;
    totalIncome: number;
    incomeCount: number;
  },
  currency = 'NGN'
): string {
  const periodLabel = formatPeriodLabel(analytics.period);

  if (analytics.incomeCount === 0) {
    return `You have no recorded income for ${periodLabel}.`;
  }

  return [
    `📈 *Income Summary (${capitalizeWords(periodLabel)})*`,
    '',
    `Total Earned: ${formatCurrency(analytics.totalIncome, currency)}`,
    `Income Transactions: ${analytics.incomeCount}`,
  ].join('\n');
}

/**
 * Formats a period-over-period comparison report for WhatsApp.
 */
export function formatPeriodComparison(
  comparison: {
    basePeriod: string;
    comparePeriod: string;
    base: { totalIncome: number; totalExpenses: number; netBalance: number };
    comparison: { totalIncome: number; totalExpenses: number; netBalance: number };
    incomeDelta: number;
    incomePercentChange: number;
    expenseDelta: number;
    expensePercentChange: number;
    netDelta: number;
  },
  currency = 'NGN'
): string {
  const baseLabel = capitalizeWords(formatPeriodLabel(comparison.basePeriod));
  const compareLabel = capitalizeWords(formatPeriodLabel(comparison.comparePeriod));

  const formatPct = (pct: number) => (pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`);

  const lines: string[] = [
    `📊 *Period Comparison (${baseLabel} vs ${compareLabel})*`,
    '',
    `📈 Income: ${formatCurrency(comparison.base.totalIncome, currency)} vs ${formatCurrency(
      comparison.comparison.totalIncome,
      currency
    )} (${formatPct(comparison.incomePercentChange)})`,
    `📉 Expenses: ${formatCurrency(comparison.base.totalExpenses, currency)} vs ${formatCurrency(
      comparison.comparison.totalExpenses,
      currency
    )} (${formatPct(comparison.expensePercentChange)})`,
    `💰 Net Balance: ${formatCurrency(comparison.base.netBalance, currency)} vs ${formatCurrency(
      comparison.comparison.netBalance,
      currency
    )}`,
  ];

  lines.push('');
  if (comparison.expenseDelta < 0) {
    lines.push(
      `Spending Trend: 📉 You spent ${formatCurrency(
        Math.abs(comparison.expenseDelta),
        currency
      )} less ${formatPeriodLabel(comparison.basePeriod)}!`
    );
  } else if (comparison.expenseDelta > 0) {
    lines.push(
      `Spending Trend: 📈 You spent ${formatCurrency(
        comparison.expenseDelta,
        currency
      )} more ${formatPeriodLabel(comparison.basePeriod)}.`
    );
  } else {
    lines.push(`Spending Trend: ⚖️ Spending was identical across both periods.`);
  }

  return lines.join('\n');
}

