import { Types } from 'mongoose';
import { Transaction, ITransactionDocument } from '../../models/Transaction';
import { calculateDateRange } from '../tools/dateRange';
import { QueryPeriod } from '../ai/schemas';

export interface CategoryAnalyticsItem {
  category: string;
  totalAmount: number;
  count: number;
  percentage: number;
}

export interface ComprehensiveAnalytics {
  period: QueryPeriod | string;
  startDate: Date;
  endDate: Date;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  averageExpense: number;
  largestExpense: ITransactionDocument | null;
  topCategories: CategoryAnalyticsItem[];
}

export interface CategorySpendAnalytics {
  category: string;
  period: QueryPeriod | string;
  startDate: Date;
  endDate: Date;
  totalAmount: number;
  transactionCount: number;
  averageAmount: number;
  largestTransaction: ITransactionDocument | null;
  recentTransactions: ITransactionDocument[];
}

export interface PeriodComparisonAnalytics {
  basePeriod: QueryPeriod | string;
  comparePeriod: QueryPeriod | string;
  base: ComprehensiveAnalytics;
  comparison: ComprehensiveAnalytics;
  incomeDelta: number;
  incomePercentChange: number;
  expenseDelta: number;
  expensePercentChange: number;
  netDelta: number;
}

/**
 * Computes deep financial analytics for a period using a high-performance MongoDB aggregation pipeline.
 */
export async function getComprehensiveAnalytics(
  userId: Types.ObjectId | string,
  period: QueryPeriod | string = 'this_month',
  timezone = 'Africa/Lagos'
): Promise<ComprehensiveAnalytics> {
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  const { startDate, endDate } = calculateDateRange(period, new Date(), timezone);

  const facetResult = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $facet: {
        typeTotals: [
          {
            $group: {
              _id: '$type',
              total: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
        ],
        categories: [
          { $match: { type: 'expense' } },
          {
            $group: {
              _id: '$category',
              total: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
          { $sort: { total: -1 } },
        ],
        largestExpense: [
          { $match: { type: 'expense' } },
          { $sort: { amount: -1 } },
          { $limit: 1 },
        ],
      },
    },
  ]);

  const typeTotals = facetResult[0]?.typeTotals || [];
  const rawCategories = facetResult[0]?.categories || [];
  const largestExpArray = facetResult[0]?.largestExpense || [];

  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const group of typeTotals) {
    if (group._id === 'income') {
      totalIncome = group.total;
      incomeCount = group.count;
    } else if (group._id === 'expense') {
      totalExpenses = group.total;
      expenseCount = group.count;
    }
  }

  const netBalance = totalIncome - totalExpenses;
  const transactionCount = incomeCount + expenseCount;
  const averageExpense = expenseCount > 0 ? totalExpenses / expenseCount : 0;

  const topCategories: CategoryAnalyticsItem[] = rawCategories.map(
    (c: { _id: string; total: number; count: number }) => ({
      category: c._id,
      totalAmount: c.total,
      count: c.count,
      percentage: totalExpenses > 0 ? (c.total / totalExpenses) * 100 : 0,
    })
  );

  const largestExpense = largestExpArray.length > 0 ? largestExpArray[0] : null;

  return {
    period,
    startDate,
    endDate,
    totalIncome,
    totalExpenses,
    netBalance,
    transactionCount,
    incomeCount,
    expenseCount,
    averageExpense,
    largestExpense,
    topCategories,
  };
}

/**
 * Computes spend analytics for a single category within a given period.
 */
export async function getCategorySpendAnalytics(
  userId: Types.ObjectId | string,
  category: string,
  period: QueryPeriod | string = 'this_month',
  timezone = 'Africa/Lagos'
): Promise<CategorySpendAnalytics> {
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  const normCategory = category.toLowerCase().trim();
  const { startDate, endDate } = calculateDateRange(period, new Date(), timezone);

  const matchStage = {
    userId: userObjectId,
    type: 'expense',
    category: normCategory,
    date: { $gte: startDate, $lte: endDate },
  };

  const facetResult = await Transaction.aggregate([
    { $match: matchStage },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
        ],
        largest: [{ $sort: { amount: -1 } }, { $limit: 1 }],
        recent: [{ $sort: { date: -1 } }, { $limit: 5 }],
      },
    },
  ]);

  const summary = facetResult[0]?.summary?.[0] || { totalAmount: 0, count: 0 };
  const largest = facetResult[0]?.largest?.[0] || null;
  const recent = facetResult[0]?.recent || [];

  const totalAmount = summary.totalAmount;
  const transactionCount = summary.count;
  const averageAmount = transactionCount > 0 ? totalAmount / transactionCount : 0;

  return {
    category: normCategory,
    period,
    startDate,
    endDate,
    totalAmount,
    transactionCount,
    averageAmount,
    largestTransaction: largest,
    recentTransactions: recent,
  };
}

/**
 * Compares financial performance across two periods (e.g. this month vs last month).
 */
export async function comparePeriodsAnalytics(
  userId: Types.ObjectId | string,
  basePeriod: QueryPeriod | string = 'this_month',
  comparePeriod: QueryPeriod | string = 'last_month',
  timezone = 'Africa/Lagos'
): Promise<PeriodComparisonAnalytics> {
  const [base, comparison] = await Promise.all([
    getComprehensiveAnalytics(userId, basePeriod, timezone),
    getComprehensiveAnalytics(userId, comparePeriod, timezone),
  ]);

  const incomeDelta = base.totalIncome - comparison.totalIncome;
  const incomePercentChange =
    comparison.totalIncome > 0
      ? (incomeDelta / comparison.totalIncome) * 100
      : base.totalIncome > 0
      ? 100
      : 0;

  const expenseDelta = base.totalExpenses - comparison.totalExpenses;
  const expensePercentChange =
    comparison.totalExpenses > 0
      ? (expenseDelta / comparison.totalExpenses) * 100
      : base.totalExpenses > 0
      ? 100
      : 0;

  const netDelta = base.netBalance - comparison.netBalance;

  return {
    basePeriod,
    comparePeriod,
    base,
    comparison,
    incomeDelta,
    incomePercentChange,
    expenseDelta,
    expensePercentChange,
    netDelta,
  };
}
