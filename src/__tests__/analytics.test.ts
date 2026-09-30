import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import { Transaction, ITransactionDocument } from '../models/Transaction';
import {
  getComprehensiveAnalytics,
  getCategorySpendAnalytics,
  comparePeriodsAnalytics,
} from '../services/analytics/analyticsService';
import {
  formatComprehensiveAnalytics,
  formatCategorySpendAnalytics,
  formatPeriodComparison,
  formatIncomeSummary,
} from '../services/tools/formatters';
import { extractIntent } from '../services/ai/intentExtractor';
import { dispatchIntent } from '../services/tools/toolDispatcher';

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
    profileType: 'business',
    businessName: 'Analytical Engine',
    currency: 'NGN',
    onboardingComplete: true,
  });
});

describe('Phase 10 — Financial Analytics', () => {
  // ── 1. Comprehensive Period Analytics Tests ─────────────────
  describe('getComprehensiveAnalytics()', () => {
    it('returns zeroes and empty categories when user has no transactions', async () => {
      const analytics = await getComprehensiveAnalytics(testUser._id, 'this_month');

      expect(analytics.totalIncome).toBe(0);
      expect(analytics.totalExpenses).toBe(0);
      expect(analytics.netBalance).toBe(0);
      expect(analytics.transactionCount).toBe(0);
      expect(analytics.averageExpense).toBe(0);
      expect(analytics.largestExpense).toBeNull();
      expect(analytics.topCategories).toEqual([]);
    });

    it('calculates income, expenses, net, average expense, and top categories accurately', async () => {
      const now = new Date();

      // Seed Income
      await Transaction.create([
        {
          userId: testUser._id,
          type: 'income',
          amount: 450000,
          currency: 'NGN',
          category: 'sales',
          source: 'text',
          date: now,
        },
      ]);

      // Seed Expenses
      await Transaction.create([
        {
          userId: testUser._id,
          type: 'expense',
          amount: 70000,
          currency: 'NGN',
          category: 'inventory',
          source: 'text',
          date: now,
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 35500,
          currency: 'NGN',
          category: 'food',
          source: 'text',
          date: now,
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 22000,
          currency: 'NGN',
          category: 'transport',
          source: 'text',
          date: now,
        },
      ]);

      const analytics = await getComprehensiveAnalytics(testUser._id, 'this_month');

      expect(analytics.totalIncome).toBe(450000);
      expect(analytics.totalExpenses).toBe(127500);
      expect(analytics.netBalance).toBe(322500);
      expect(analytics.transactionCount).toBe(4);
      expect(analytics.incomeCount).toBe(1);
      expect(analytics.expenseCount).toBe(3);
      expect(analytics.averageExpense).toBe(127500 / 3); // 42,500
      expect(analytics.largestExpense?.amount).toBe(70000);
      expect(analytics.largestExpense?.category).toBe('inventory');

      expect(analytics.topCategories).toHaveLength(3);
      expect(analytics.topCategories[0].category).toBe('inventory');
      expect(analytics.topCategories[0].totalAmount).toBe(70000);
      expect(analytics.topCategories[0].percentage).toBeCloseTo((70000 / 127500) * 100);

      expect(analytics.topCategories[1].category).toBe('food');
      expect(analytics.topCategories[1].totalAmount).toBe(35500);

      expect(analytics.topCategories[2].category).toBe('transport');
      expect(analytics.topCategories[2].totalAmount).toBe(22000);
    });
  });

  // ── 2. Category Spend Analytics Tests ───────────────────────
  describe('getCategorySpendAnalytics()', () => {
    it('aggregates category-specific spend accurately', async () => {
      const now = new Date();

      await Transaction.create([
        {
          userId: testUser._id,
          type: 'expense',
          amount: 15000,
          category: 'food',
          description: 'Lunch',
          source: 'text',
          date: now,
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 20500,
          category: 'food',
          description: 'Dinner with client',
          source: 'text',
          date: now,
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 12000,
          category: 'fuel',
          source: 'text',
          date: now,
        },
      ]);

      const foodAnalytics = await getCategorySpendAnalytics(testUser._id, 'food', 'this_month');

      expect(foodAnalytics.category).toBe('food');
      expect(foodAnalytics.totalAmount).toBe(35500);
      expect(foodAnalytics.transactionCount).toBe(2);
      expect(foodAnalytics.averageAmount).toBe(17750);
      expect(foodAnalytics.largestTransaction?.amount).toBe(20500);
      expect(foodAnalytics.recentTransactions).toHaveLength(2);
    });

    it('handles category with zero recorded transactions', async () => {
      const analytics = await getCategorySpendAnalytics(testUser._id, 'rent', 'this_month');

      expect(analytics.totalAmount).toBe(0);
      expect(analytics.transactionCount).toBe(0);
      expect(analytics.averageAmount).toBe(0);
      expect(analytics.largestTransaction).toBeNull();
    });
  });

  // ── 3. Period Comparison Analytics Tests ───────────────────
  describe('comparePeriodsAnalytics()', () => {
    it('compares this month vs last month with positive income and reduced spending', async () => {
      // Calculate date in last month
      const now = new Date();
      const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15));

      // Last Month Data
      await Transaction.create([
        {
          userId: testUser._id,
          type: 'income',
          amount: 380000,
          category: 'sales',
          source: 'text',
          date: lastMonthDate,
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 210000,
          category: 'inventory',
          source: 'text',
          date: lastMonthDate,
        },
      ]);

      // This Month Data
      await Transaction.create([
        {
          userId: testUser._id,
          type: 'income',
          amount: 450000,
          category: 'sales',
          source: 'text',
          date: now,
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 173500,
          category: 'inventory',
          source: 'text',
          date: now,
        },
      ]);

      const comparison = await comparePeriodsAnalytics(
        testUser._id,
        'this_month',
        'last_month'
      );

      expect(comparison.base.totalIncome).toBe(450000);
      expect(comparison.comparison.totalIncome).toBe(380000);
      expect(comparison.incomeDelta).toBe(70000);
      expect(comparison.incomePercentChange).toBeCloseTo((70000 / 380000) * 100);

      expect(comparison.base.totalExpenses).toBe(173500);
      expect(comparison.comparison.totalExpenses).toBe(210000);
      expect(comparison.expenseDelta).toBe(-36500);
      expect(comparison.expensePercentChange).toBeCloseTo((-36500 / 210000) * 100);

      expect(comparison.netDelta).toBe(450000 - 173500 - (380000 - 210000));
    });
  });

  // ── 4. Natural Language Formatting Tests ─────────────────────
  describe('Analytics WhatsApp Formatters', () => {
    it('formats comprehensive period analytics with emoji breakdown and top categories', () => {
      const formatted = formatComprehensiveAnalytics(
        {
          period: 'this_month',
          totalIncome: 450000,
          totalExpenses: 173500,
          netBalance: 276500,
          transactionCount: 32,
          averageExpense: 6425,
          largestExpense: {
            amount: 70000,
            category: 'inventory',
          } as unknown as ITransactionDocument,
          topCategories: [
            { category: 'inventory', totalAmount: 70000, percentage: 40.3 },
            { category: 'food', totalAmount: 35500, percentage: 20.5 },
            { category: 'transport', totalAmount: 22000, percentage: 12.7 },
          ],
        },
        'NGN'
      );

      expect(formatted).toContain('📊 *This Month*');
      expect(formatted).toContain('Income: ₦450,000');
      expect(formatted).toContain('Expenses: ₦173,500');
      expect(formatted).toContain('Net: ₦276,500');
      expect(formatted).toContain('Transactions: 32');
      expect(formatted).toContain('Average Expense: ₦6,425');
      expect(formatted).toContain('Largest Expense: ₦70,000 (Inventory)');
      expect(formatted).toContain('1. Inventory: ₦70,000 (40.3%)');
      expect(formatted).toContain('2. Food: ₦35,500 (20.5%)');
      expect(formatted).toContain('3. Transport: ₦22,000 (12.7%)');
    });

    it('formats category spend analytics cleanly', () => {
      const formatted = formatCategorySpendAnalytics(
        {
          category: 'food',
          period: 'this_month',
          totalAmount: 35500,
          transactionCount: 5,
          averageAmount: 7100,
          largestTransaction: {
            amount: 12000,
            date: new Date(),
          } as unknown as ITransactionDocument,
        },
        'NGN'
      );

      expect(formatted).toContain('🛒 *Food Spending (This Month)*');
      expect(formatted).toContain('Total: ₦35,500');
      expect(formatted).toContain('Transactions: 5');
      expect(formatted).toContain('Average: ₦7,100');
      expect(formatted).toContain('Largest: ₦12,000 on Today');
    });

    it('formats period comparison with trends', () => {
      const formatted = formatPeriodComparison(
        {
          basePeriod: 'this_month',
          comparePeriod: 'last_month',
          base: { totalIncome: 450000, totalExpenses: 173500, netBalance: 276500 },
          comparison: { totalIncome: 380000, totalExpenses: 210000, netBalance: 170000 },
          incomeDelta: 70000,
          incomePercentChange: 18.4,
          expenseDelta: -36500,
          expensePercentChange: -17.4,
          netDelta: 106500,
        },
        'NGN'
      );

      expect(formatted).toContain('📊 *Period Comparison (This Month vs Last Month)*');
      expect(formatted).toContain('📈 Income: ₦450,000 vs ₦380,000 (+18.4%)');
      expect(formatted).toContain('📉 Expenses: ₦173,500 vs ₦210,000 (-17.4%)');
      expect(formatted).toContain('Spending Trend: 📉 You spent ₦36,500 less this month!');
    });

    it('formats income summary cleanly', () => {
      const formatted = formatIncomeSummary(
        {
          period: 'this_month',
          totalIncome: 450000,
          incomeCount: 4,
        },
        'NGN'
      );

      expect(formatted).toContain('📈 *Income Summary (This Month)*');
      expect(formatted).toContain('Total Earned: ₦450,000');
      expect(formatted).toContain('Income Transactions: 4');
    });
  });

  // ── 5. Natural Language Intent & Dispatch Integration ────────
  describe('Natural Language Queries Execution', () => {
    beforeEach(async () => {
      const now = new Date();
      await Transaction.create([
        {
          userId: testUser._id,
          type: 'income',
          amount: 500000,
          category: 'sales',
          source: 'text',
          date: now,
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 40000,
          category: 'food',
          source: 'text',
          date: now,
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 25000,
          category: 'fuel',
          source: 'text',
          date: now,
        },
      ]);
    });

    it('executes "How much did I make this month?"', async () => {
      const intent = await extractIntent('How much did I make this month?');
      expect(intent.intent).toBe('financial_query');
      if (intent.intent === 'financial_query') {
        expect(intent.queryType).toBe('income_summary');
        expect(intent.period).toBe('this_month');
      }

      const response = await dispatchIntent(intent, {
        user: testUser,
        source: 'text',
      });

      expect(response).toContain('📈 *Income Summary (This Month)*');
      expect(response).toContain('Total Earned: ₦500,000');
    });

    it('executes "How much did I spend on food?"', async () => {
      const intent = await extractIntent('How much did I spend on food?');
      expect(intent.intent).toBe('financial_query');
      if (intent.intent === 'financial_query') {
        expect(intent.queryType).toBe('category_spend');
        expect(intent.category).toBe('food');
      }

      const response = await dispatchIntent(intent, {
        user: testUser,
        source: 'text',
      });

      expect(response).toContain('🛒 *Food Spending (This Month)*');
      expect(response).toContain('Total: ₦40,000');
      expect(response).toContain('Transactions: 1');
    });

    it('executes "Where am I spending the most money?"', async () => {
      const intent = await extractIntent('Where am I spending the most money?');
      expect(intent.intent).toBe('financial_query');
      if (intent.intent === 'financial_query') {
        expect(intent.queryType).toBe('category_summary');
      }

      const response = await dispatchIntent(intent, {
        user: testUser,
        source: 'text',
      });

      expect(response).toContain('📊 Category Breakdown (This Month):');
      expect(response).toContain('Food: ₦40,000');
      expect(response).toContain('Fuel: ₦25,000');
    });

    it('executes "Compare this month with last month."', async () => {
      const intent = await extractIntent('Compare this month with last month.');
      expect(intent.intent).toBe('financial_query');
      if (intent.intent === 'financial_query') {
        expect(intent.queryType).toBe('compare_periods');
        expect(intent.period).toBe('this_month');
        expect(intent.comparePeriod).toBe('last_month');
      }

      const response = await dispatchIntent(intent, {
        user: testUser,
        source: 'text',
      });

      expect(response).toContain('📊 *Period Comparison (This Month vs Last Month)*');
      expect(response).toContain('📈 Income: ₦500,000 vs ₦0');
      expect(response).toContain('📉 Expenses: ₦65,000 vs ₦0');
    });
  });
});
