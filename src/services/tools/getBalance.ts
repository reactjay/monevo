import { Types } from 'mongoose';
import { Transaction } from '../../models/Transaction';
import { BalanceResult } from './types';

/**
 * Computes running balance, total income, and total expenses for a user using MongoDB aggregation.
 */
export async function getBalance(
  userId: Types.ObjectId | string,
  currency = 'NGN'
): Promise<BalanceResult> {
  const userObjectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;

  const aggregation = await Transaction.aggregate([
    { $match: { userId: userObjectId } },
    {
      $group: {
        _id: '$type',
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
  ]);

  let totalIncome = 0;
  let totalExpenses = 0;
  let transactionCount = 0;

  for (const group of aggregation) {
    if (group._id === 'income') {
      totalIncome = group.total;
    } else if (group._id === 'expense') {
      totalExpenses = group.total;
    }
    transactionCount += group.count;
  }

  const totalIncomeInt = Math.round(totalIncome);
  const totalExpensesInt = Math.round(totalExpenses);
  const balance = totalIncomeInt - totalExpensesInt;

  return {
    balance,
    balanceBigInt: BigInt(balance),
    totalIncome: totalIncomeInt,
    totalExpenses: totalExpensesInt,
    currency,
    transactionCount,
  };
}
