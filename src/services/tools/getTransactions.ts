import { Types } from 'mongoose';
import { Transaction, ITransactionDocument } from '../../models/Transaction';
import { GetTransactionsFilter } from './types';

/**
 * Retrieves a list of transactions matching the given filter criteria, sorted by date descending.
 */
export async function getTransactions(
  filter: GetTransactionsFilter
): Promise<ITransactionDocument[]> {
  const { userId, type, category, startDate, endDate, limit = 10, offset = 0 } = filter;
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

  const query: Record<string, unknown> = {
    userId: userObjectId,
  };

  if (type) {
    query.type = type;
  }

  if (category) {
    query.category = category.toLowerCase().trim();
  }

  if (startDate || endDate) {
    query.date = {};
    if (startDate) {
      (query.date as Record<string, unknown>).$gte = startDate;
    }
    if (endDate) {
      (query.date as Record<string, unknown>).$lte = endDate;
    }
  }

  return Transaction.find(query)
    .sort({ date: -1 })
    .skip(offset)
    .limit(limit)
    .exec();
}
