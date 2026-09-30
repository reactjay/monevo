import { Types } from 'mongoose';
import { Transaction } from '../../models/Transaction';
import { calculateDateRange } from './dateRange';
import { CategorySummaryItem } from './types';
import { QueryPeriod, TransactionType } from '../ai/schemas';

/**
 * Computes category breakdown for a given period and transaction type using MongoDB aggregation.
 */
export async function getCategorySummary(
  userId: Types.ObjectId | string,
  period: QueryPeriod | string = 'this_month',
  type: TransactionType = 'expense',
  timezone = 'Africa/Lagos'
): Promise<CategorySummaryItem[]> {
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  const { startDate, endDate } = calculateDateRange(period, new Date(), timezone);

  const aggregation = await Transaction.aggregate([
    {
      $match: {
        userId: userObjectId,
        type,
        date: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { totalAmount: -1 },
    },
  ]);

  const total = aggregation.reduce((sum, item) => sum + item.totalAmount, 0);

  return aggregation.map((item) => ({
    category: item._id,
    totalAmount: item.totalAmount,
    count: item.count,
    percentage: total > 0 ? (item.totalAmount / total) * 100 : 0,
  }));
}
