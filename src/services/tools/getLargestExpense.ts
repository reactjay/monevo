import { Types } from 'mongoose';
import { Transaction, ITransactionDocument } from '../../models/Transaction';
import { calculateDateRange } from './dateRange';
import { QueryPeriod } from '../ai/schemas';

/**
 * Finds the largest expense recorded in the specified period.
 */
export async function getLargestExpense(
  userId: Types.ObjectId | string,
  period: QueryPeriod | string = 'this_month',
  timezone = 'Africa/Lagos'
): Promise<ITransactionDocument | null> {
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  const { startDate, endDate } = calculateDateRange(period, new Date(), timezone);

  const largestExpense = await Transaction.findOne({
    userId: userObjectId,
    type: 'expense',
    date: { $gte: startDate, $lte: endDate },
  })
    .sort({ amount: -1 })
    .exec();

  return largestExpense;
}
