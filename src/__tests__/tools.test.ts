import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import { Transaction } from '../models/Transaction';
import {
  recordTransaction,
  getBalance,
  getPeriodSummary,
  getCategorySummary,
  getLargestExpense,
  getTransactions,
  getUserProfile,
  updateUserProfile,
  dispatchIntent,
  formatCurrency,
  formatFriendlyDate,
} from '../services/tools';

let testUser: IUserDocument;

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();

  testUser = await User.create({
    whatsappId: '2348011223344',
    name: 'Ada Lovelace',
    profileType: 'personal',
    currency: 'NGN',
    onboardingComplete: true,
  });
});

describe('Financial Tools Unit Tests', () => {
  describe('formatters', () => {
    it('formats currency correctly with symbols', () => {
      expect(formatCurrency(12000, 'NGN')).toBe('₦12,000');
      expect(formatCurrency(150.5, 'USD')).toBe('$150.50');
      expect(formatCurrency(500, 'GBP')).toBe('£500');
      expect(formatCurrency(100, 'EUR')).toBe('€100');
      expect(formatCurrency(2500, 'CAD')).toBe('CA$2,500');
    });

    it('formats friendly dates correctly', () => {
      const now = new Date();
      expect(formatFriendlyDate(now, now)).toBe('Today');

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatFriendlyDate(yesterday, now)).toBe('Yesterday');
    });
  });

  describe('recordTransaction()', () => {
    it('records an expense transaction and computes running balance', async () => {
      const result = await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 12000,
        currency: 'NGN',
        category: 'fuel',
        description: 'Fuel for generator',
        source: 'text',
      });

      expect(result.transaction).toBeDefined();
      expect(result.transaction.amount).toBe(12000);
      expect(result.transaction.category).toBe('fuel');
      expect(result.runningBalance).toBe(-12000);
      expect(result.formattedResponse).toContain('✅ Expense recorded');
      expect(result.formattedResponse).toContain('Amount: ₦12,000');
      expect(result.formattedResponse).toContain('Category: Fuel');
      expect(result.formattedResponse).toContain('Your running balance is -₦12,000');

      // Verify in DB
      const dbTx = await Transaction.findById(result.transaction._id);
      expect(dbTx).not.toBeNull();
      expect(dbTx?.category).toBe('fuel');
    });

    it('records an income transaction and updates running balance', async () => {
      // First expense
      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 20000,
        currency: 'NGN',
        category: 'food',
        source: 'text',
      });

      // Then income
      const result = await recordTransaction({
        userId: testUser._id,
        type: 'income',
        amount: 150000,
        currency: 'NGN',
        category: 'sales',
        counterparty: 'David',
        description: 'Website development',
        source: 'voice',
        transcript: 'David paid me 150k for website development',
      });

      expect(result.transaction.type).toBe('income');
      expect(result.transaction.counterparty).toBe('David');
      expect(result.transaction.source).toBe('voice');
      expect(result.runningBalance).toBe(130000);
      expect(result.formattedResponse).toContain('✅ Income recorded');
      expect(result.formattedResponse).toContain('Amount: ₦150,000');
      expect(result.formattedResponse).toContain('From: David');
      expect(result.formattedResponse).toContain('Your running balance is ₦130,000');
    });

    it('throws error when required fields are invalid', async () => {
      await expect(
        recordTransaction({
          userId: testUser._id,
          type: 'invalid' as unknown as 'income',
          amount: 100,
          category: 'food',
          source: 'text',
        })
      ).rejects.toThrow('Invalid transaction type');

      await expect(
        recordTransaction({
          userId: testUser._id,
          type: 'expense',
          amount: -50,
          category: 'food',
          source: 'text',
        })
      ).rejects.toThrow('Amount must be a positive number');

      await expect(
        recordTransaction({
          userId: testUser._id,
          type: 'expense',
          amount: 100,
          category: '',
          source: 'text',
        })
      ).rejects.toThrow('Transaction category is required');
    });
  });

  describe('getBalance()', () => {
    it('returns zero balance when user has no transactions', async () => {
      const balance = await getBalance(testUser._id, 'NGN');
      expect(balance.balance).toBe(0);
      expect(balance.totalIncome).toBe(0);
      expect(balance.totalExpenses).toBe(0);
      expect(balance.transactionCount).toBe(0);
    });

    it('aggregates income and expenses correctly', async () => {
      await recordTransaction({
        userId: testUser._id,
        type: 'income',
        amount: 200000,
        currency: 'NGN',
        category: 'salary',
        source: 'text',
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 35000,
        currency: 'NGN',
        category: 'groceries',
        source: 'text',
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 15000,
        currency: 'NGN',
        category: 'fuel',
        source: 'text',
      });

      const balance = await getBalance(testUser._id, 'NGN');
      expect(balance.totalIncome).toBe(200000);
      expect(balance.totalExpenses).toBe(50000);
      expect(balance.balance).toBe(150000);
      expect(balance.transactionCount).toBe(3);
    });
  });

  describe('getPeriodSummary() and getCategorySummary()', () => {
    beforeEach(async () => {
      // Seed transactions
      await recordTransaction({
        userId: testUser._id,
        type: 'income',
        amount: 300000,
        category: 'salary',
        source: 'text',
        date: new Date(),
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 40000,
        category: 'food',
        source: 'text',
        date: new Date(),
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 25000,
        category: 'food',
        source: 'text',
        date: new Date(),
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 18000,
        category: 'fuel',
        source: 'text',
        date: new Date(),
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 12000,
        category: 'transport',
        source: 'text',
        date: new Date(),
      });
    });

    it('computes period summary with facet aggregation and top category', async () => {
      const summary = await getPeriodSummary(testUser._id, 'this_month');

      expect(summary.totalIncome).toBe(300000);
      expect(summary.totalExpenses).toBe(95000);
      expect(summary.net).toBe(205000);
      expect(summary.transactionCount).toBe(5);
      expect(summary.topCategory?.name).toBe('food');
      expect(summary.topCategory?.amount).toBe(65000);
    });

    it('computes category breakdown sorted by amount descending', async () => {
      const categories = await getCategorySummary(testUser._id, 'this_month', 'expense');

      expect(categories).toHaveLength(3);
      expect(categories[0].category).toBe('food');
      expect(categories[0].totalAmount).toBe(65000);
      expect(categories[0].count).toBe(2);

      expect(categories[1].category).toBe('fuel');
      expect(categories[1].totalAmount).toBe(18000);

      expect(categories[2].category).toBe('transport');
      expect(categories[2].totalAmount).toBe(12000);
    });
  });

  describe('getLargestExpense()', () => {
    it('returns the highest expense document for the period', async () => {
      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 12000,
        category: 'fuel',
        source: 'text',
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 85000,
        category: 'electronics',
        description: 'New monitor',
        source: 'text',
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 25000,
        category: 'food',
        source: 'text',
      });

      const largest = await getLargestExpense(testUser._id, 'this_month');
      expect(largest).not.toBeNull();
      expect(largest?.amount).toBe(85000);
      expect(largest?.category).toBe('electronics');
    });

    it('returns null if there are no expenses in the period', async () => {
      const largest = await getLargestExpense(testUser._id, 'this_month');
      expect(largest).toBeNull();
    });
  });

  describe('getTransactions()', () => {
    it('filters transactions by type, category, and limits results', async () => {
      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 5000,
        category: 'fuel',
        source: 'text',
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 10000,
        category: 'food',
        source: 'text',
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'income',
        amount: 50000,
        category: 'sales',
        source: 'text',
      });

      const fuelTxs = await getTransactions({ userId: testUser._id, category: 'fuel' });
      expect(fuelTxs).toHaveLength(1);
      expect(fuelTxs[0].category).toBe('fuel');

      const expenseTxs = await getTransactions({ userId: testUser._id, type: 'expense' });
      expect(expenseTxs).toHaveLength(2);

      const limited = await getTransactions({ userId: testUser._id, limit: 1 });
      expect(limited).toHaveLength(1);
    });
  });

  describe('userProfile management', () => {
    it('retrieves user profile', async () => {
      const profile = await getUserProfile(testUser._id);
      expect(profile).not.toBeNull();
      expect(profile?.name).toBe('Ada Lovelace');
    });

    it('updates user profile safely', async () => {
      const updated = await updateUserProfile(testUser._id, {
        name: 'Ada King-Noel',
        businessName: 'Analytical Engine Ltd',
      });
      expect(updated?.name).toBe('Ada King-Noel');
      expect(updated?.businessName).toBe('Analytical Engine Ltd');
    });
  });

  describe('dispatchIntent()', () => {
    it('dispatches help intent', async () => {
      const response = await dispatchIntent(
        { intent: 'help' },
        { user: testUser, source: 'text' }
      );
      expect(response).toContain('Monevo Financial Assistant');
      expect(response).toContain('Record Expenses & Income');
    });

    it('dispatches unknown intent with helpful guidance', async () => {
      const response = await dispatchIntent(
        { intent: 'unknown', rawText: 'asdfghjk' },
        { user: testUser, source: 'text' }
      );
      expect(response).toContain("I didn't quite catch that");
    });

    it('dispatches clarification_required intent with prompt', async () => {
      const response = await dispatchIntent(
        {
          intent: 'clarification_required',
          missing: ['amount'],
          clarificationPrompt: 'How much did you spend on fuel?',
        },
        { user: testUser, source: 'text' }
      );
      expect(response).toBe('How much did you spend on fuel?');
    });
  });
});
