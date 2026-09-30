import { Types } from 'mongoose';
import { Transaction } from '../../models/Transaction';
import { calculateDateRange } from './dateRange';
import { PeriodSummaryResult, CategorySummaryItem } from './types';
import { QueryPeriod } from '../ai/schemas';

/**
 * Computes a period summary (income, expenses, net, transaction count, category breakdown)
 * using a single, efficient MongoDB aggregation pipeline.
 */
export async function getPeriodSummary(
  userId: Types.ObjectId | string,
  period: QueryPeriod | string = 'this_month',
  customStartDate?: Date,
  customEndDate?: Date,
  timezone = 'Africa/Lagos'
): Promise<PeriodSummaryResult> {
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

  const { startDate, endDate } =
    customStartDate && customEndDate
      ? { startDate: customStartDate, endDate: customEndDate }
      : calculateDateRange(period, new Date(), timezone);

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
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
          { $sort: { totalAmount: -1 } },
        ],
        totalCount: [
          {
            $count: 'count',
          },
        ],
      },
    },
  ]);

  const typeTotals = facetResult[0]?.typeTotals || [];
  const rawCategories = facetResult[0]?.categories || [];
  const totalCount = facetResult[0]?.totalCount?.[0]?.count || 0;

  let totalIncome = 0;
  let totalExpenses = 0;

  for (const group of typeTotals) {
    if (group._id === 'income') {
      totalIncome = group.total;
    } else if (group._id === 'expense') {
      totalExpenses = group.total;
    }
  }

  const net = totalIncome - totalExpenses;

  const categories: CategorySummaryItem[] = rawCategories.map(
    (c: { _id: string; totalAmount: number; count: number }) => ({
      category: c._id,
      totalAmount: c.totalAmount,
      count: c.count,
      percentage: totalExpenses > 0 ? (c.totalAmount / totalExpenses) * 100 : 0,
    })
  );

  const topCategory =
    categories.length > 0
      ? {
          name: categories[0].category,
          amount: categories[0].totalAmount,
        }
      : null;

  return {
    period,
    startDate,
    endDate,
    totalIncome,
    totalExpenses,
    net,
    transactionCount: totalCount,
    topCategory,
    categories,
  };
}
