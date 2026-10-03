import { Types } from 'mongoose';
import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import { Transaction } from '../models/Transaction';
import {
  getTransactionsByTimeframe,
  formatTransactionsChat,
  formatTransactionsByTimeframe,
  getTimeframeTransactionReport,
  formatLineDate,
  getHeaderForPeriod,
  calculateTimeframeBounds,
  EnrichedTransactionRecord,
} from '../services/transactions/transactionService';

describe('Transaction Service — Filtered Raw Transaction Records by Period (Issue #8)', () => {
  let user: IUserDocument;
  const fixedReferenceDate = new Date('2026-10-10T12:00:00.000Z');

  beforeAll(async () => {
    await connectTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    user = await User.create({
      whatsappId: '2348011223344',
      profileType: 'personal',
      name: 'Amaka Eze',
      currency: 'NGN',
    });
  });

  // ── 1. Daily Boundary Filtering ─────────────────────────────────────
  describe('Daily Boundary Filtering', () => {
    it('retrieves only transactions created from start of today (00:00:00 UTC) to now', async () => {
      // Today at 08:00 UTC
      const txTodayMorning = await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 500000, // 5000 NGN in Kobo
        currency: 'NGN',
        category: 'food',
        description: 'Breakfast',
        date: new Date('2026-10-10T08:00:00.000Z'),
        source: 'text',
      });

      // Today at 00:00:00 UTC (exact start of day boundary)
      const txTodayBoundary = await Transaction.create({
        userId: user._id,
        type: 'income',
        amount: 2500000, // 25000 NGN in Kobo
        currency: 'NGN',
        category: 'freelance',
        description: 'Early morning payout',
        date: new Date('2026-10-10T00:00:00.000Z'),
        source: 'text',
      });

      // Yesterday at 23:59:59 UTC (1 second before today - must be excluded)
      await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 300000,
        currency: 'NGN',
        category: 'transport',
        description: 'Late night taxi',
        date: new Date('2026-10-09T23:59:59.000Z'),
        source: 'text',
      });

      // 3 days ago (must be excluded)
      await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 1000000,
        currency: 'NGN',
        category: 'groceries',
        description: 'Supermarket shopping',
        date: new Date('2026-10-07T14:00:00.000Z'),
        source: 'text',
      });

      const records = await getTransactionsByTimeframe(user._id, 'daily', {
        referenceDate: fixedReferenceDate,
        timezone: 'UTC',
      });

      expect(records.length).toBe(2);
      const returnedIds = records.map((r) => r.id);
      expect(returnedIds).toContain(txTodayMorning._id.toString());
      expect(returnedIds).toContain(txTodayBoundary._id.toString());
    });
  });

  // ── 2. Weekly Boundary Filtering (Last 7 Calendar Days) ─────────────
  describe('Weekly Boundary Filtering', () => {
    it('retrieves transactions created within the last 7 calendar days', async () => {
      // Day 0: Today
      const txToday = await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 1200000,
        currency: 'NGN',
        category: 'fuel',
        description: 'Fuel for car',
        date: new Date('2026-10-10T10:00:00.000Z'),
        source: 'text',
      });

      // Day -3: 3 days ago
      const tx3DaysAgo = await Transaction.create({
        userId: user._id,
        type: 'income',
        amount: 15000000,
        currency: 'NGN',
        category: 'payment',
        description: 'Consulting fee',
        date: new Date('2026-10-07T12:00:00.000Z'),
        source: 'text',
      });

      // Day -7: 7 days ago (boundary)
      const tx7DaysAgo = await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 450000,
        currency: 'NGN',
        category: 'airtime',
        description: 'Recharge card',
        date: new Date('2026-10-03T02:00:00.000Z'),
        source: 'text',
      });

      // Day -8: 8 days ago (must be excluded)
      await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 800000,
        currency: 'NGN',
        category: 'dining',
        description: 'Dinner with team',
        date: new Date('2026-10-02T22:00:00.000Z'),
        source: 'text',
      });

      // Day -15: 15 days ago (must be excluded)
      await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 9900000,
        currency: 'NGN',
        category: 'shopping',
        description: 'Shoes',
        date: new Date('2026-09-25T11:00:00.000Z'),
        source: 'text',
      });

      const records = await getTransactionsByTimeframe(user._id, 'weekly', {
        referenceDate: fixedReferenceDate,
        timezone: 'UTC',
      });

      expect(records.length).toBe(3);
      const returnedIds = records.map((r) => r.id);
      expect(returnedIds).toContain(txToday._id.toString());
      expect(returnedIds).toContain(tx3DaysAgo._id.toString());
      expect(returnedIds).toContain(tx7DaysAgo._id.toString());
    });
  });

  // ── 3. Monthly Boundary Filtering (Last 30 Calendar Days) ────────────
  describe('Monthly Boundary Filtering', () => {
    it('retrieves transactions created within the last 30 calendar days', async () => {
      // Day 0: Today
      const txToday = await Transaction.create({
        userId: user._id,
        type: 'income',
        amount: 5000000,
        currency: 'NGN',
        category: 'salary',
        description: 'Bonus',
        date: new Date('2026-10-10T09:00:00.000Z'),
        source: 'text',
      });

      // Day -15: 15 days ago
      const tx15DaysAgo = await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 2500000,
        currency: 'NGN',
        category: 'groceries',
        description: 'Weekly cart',
        date: new Date('2026-09-25T10:00:00.000Z'),
        source: 'text',
      });

      // Day -29: 29 days ago
      const tx29DaysAgo = await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 1000000,
        currency: 'NGN',
        category: 'fuel',
        description: 'Fuel station',
        date: new Date('2026-09-11T16:00:00.000Z'),
        source: 'text',
      });

      // Day -31: 31 days ago (must be excluded)
      await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 4000000,
        currency: 'NGN',
        category: 'rent',
        description: 'Past rent part',
        date: new Date('2026-09-08T12:00:00.000Z'),
        source: 'text',
      });

      const records = await getTransactionsByTimeframe(user._id, 'monthly', {
        referenceDate: fixedReferenceDate,
        timezone: 'UTC',
      });

      expect(records.length).toBe(3);
      const returnedIds = records.map((r) => r.id);
      expect(returnedIds).toContain(txToday._id.toString());
      expect(returnedIds).toContain(tx15DaysAgo._id.toString());
      expect(returnedIds).toContain(tx29DaysAgo._id.toString());
    });
  });

  // ── 4. Minor-to-Major Conversion & Field Enrichment ─────────────────
  describe('Minor-to-Major Currency Conversion & Field Enrichment', () => {
    it('correctly converts minor units (kobo/cents) to major units (NGN/USD)', async () => {
      // 150,000 NGN in Kobo = 15,000,000
      await Transaction.create({
        userId: user._id,
        type: 'income',
        amount: 15000000,
        currency: 'NGN',
        category: 'freelance',
        description: 'Website payment from David',
        date: new Date('2026-10-10T11:00:00.000Z'),
        source: 'text',
      });

      // 12,000 NGN in Kobo = 1,200,000
      await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 1200000,
        currency: 'NGN',
        category: 'fuel',
        description: 'Fuel for car',
        date: new Date('2026-10-10T10:00:00.000Z'),
        source: 'text',
      });

      // 150.50 USD in Cents = 15,050
      await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 15050,
        currency: 'USD',
        category: 'software',
        description: 'Cloud Server Subscription',
        date: new Date('2026-10-10T09:00:00.000Z'),
        source: 'text',
      });

      const records = await getTransactionsByTimeframe(user._id, 'daily', {
        referenceDate: fixedReferenceDate,
        timezone: 'UTC',
      });

      expect(records.length).toBe(3);

      const incomeRec = records.find((r) => r.type === 'income');
      expect(incomeRec).toBeDefined();
      expect(incomeRec!.amount).toBe(150000); // 15,000,000 kobo -> 150,000 NGN
      expect(incomeRec!.amountMinor).toBe(15000000);
      expect(incomeRec!.currency).toBe('NGN');
      expect(incomeRec!.category).toBe('freelance');

      const fuelRec = records.find((r) => r.category === 'fuel');
      expect(fuelRec).toBeDefined();
      expect(fuelRec!.amount).toBe(12000); // 1,200,000 kobo -> 12,000 NGN
      expect(fuelRec!.amountMinor).toBe(1200000);

      const usdRec = records.find((r) => r.currency === 'USD');
      expect(usdRec).toBeDefined();
      expect(usdRec!.amount).toBe(150.5); // 15,050 cents -> 150.5 USD
      expect(usdRec!.amountMinor).toBe(15050);
    });

    it('preserves original input text and transcript snippet for auditability', async () => {
      // Voice message with transcript
      const voiceTx = await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 500000,
        currency: 'NGN',
        category: 'food',
        description: 'Lunch at Mama Cass',
        transcript: 'I spent five thousand naira on lunch today at Mama Cass',
        date: new Date('2026-10-10T11:00:00.000Z'),
        source: 'voice',
      });

      // Text message with description
      const textTx = await Transaction.create({
        userId: user._id,
        type: 'income',
        amount: 7500000,
        currency: 'NGN',
        category: 'consulting',
        description: 'UI Design Review session',
        date: new Date('2026-10-10T10:00:00.000Z'),
        source: 'text',
      });

      const records = await getTransactionsByTimeframe(user._id, 'daily', {
        referenceDate: fixedReferenceDate,
        timezone: 'UTC',
      });

      const voiceRecord = records.find((r) => r.id === voiceTx._id.toString());
      expect(voiceRecord?.rawInput).toBe('I spent five thousand naira on lunch today at Mama Cass');
      expect(voiceRecord?.transcript).toBe('I spent five thousand naira on lunch today at Mama Cass');
      expect(voiceRecord?.source).toBe('voice');

      const textRecord = records.find((r) => r.id === textTx._id.toString());
      expect(textRecord?.rawInput).toBe('UI Design Review session');
      expect(textRecord?.description).toBe('UI Design Review session');
      expect(textRecord?.source).toBe('text');
    });
  });

  // ── 5. WhatsApp Chat Formatter ──────────────────────────────────────
  describe('WhatsApp Chat Formatter', () => {
    it('returns empty-state copy when no records exist', () => {
      const output = formatTransactionsChat([], 'weekly');
      expect(output).toBe('No transactions recorded for this period.');

      const outputDaily = formatTransactionsByTimeframe([], 'daily');
      expect(outputDaily).toBe('No transactions recorded for this period.');
    });

    it('formats weekly transaction list with header, line items, and summary footer', () => {
      const sampleRecords: EnrichedTransactionRecord[] = [
        {
          id: 'rec_1',
          _id: new Types.ObjectId(),
          amount: 150000,
          amountMinor: 15000000,
          currency: 'NGN',
          category: 'freelance',
          rawInput: 'Website development for David',
          transcript: 'Website development for David',
          date: new Date('2026-10-09T14:30:00.000Z'),
          type: 'income',
          source: 'text',
        },
        {
          id: 'rec_2',
          _id: new Types.ObjectId(),
          amount: 12000,
          amountMinor: 1200000,
          currency: 'NGN',
          category: 'fuel',
          rawInput: 'Fuel for car',
          description: 'Fuel for car',
          date: new Date('2026-10-08T09:15:00.000Z'),
          type: 'expense',
          source: 'text',
        },
        {
          id: 'rec_3',
          _id: new Types.ObjectId(),
          amount: 5000,
          amountMinor: 500000,
          currency: 'NGN',
          category: 'food',
          rawInput: '',
          date: new Date('2026-10-05T18:00:00.000Z'),
          type: 'expense',
          source: 'text',
        },
      ];

      const formatted = formatTransactionsChat(sampleRecords, 'weekly', {
        timezone: 'UTC',
      });

      // 1. Header
      expect(formatted).toContain('📅 *Transactions (Last 7 Days)*');

      // 2. Line Items matching: • [DD/MM] ₦X,XXX — Category ("original note/transcript")
      expect(formatted).toContain('• [09/10] ₦150,000 — Freelance ("Website development for David")');
      expect(formatted).toContain('• [08/10] ₦12,000 — Fuel ("Fuel for car")');
      expect(formatted).toContain('• [05/10] ₦5,000 — Food');

      // 3. Footer Summary: Total In, Total Out, and Net Balance
      expect(formatted).toContain('Total In: ₦150,000');
      expect(formatted).toContain('Total Out: ₦17,000');
      expect(formatted).toContain('Net Balance: ₦133,000');
    });

    it('formats daily header and handles negative net balance when expenses exceed income', () => {
      const expenseOnlyRecords: EnrichedTransactionRecord[] = [
        {
          id: 'rec_4',
          _id: new Types.ObjectId(),
          amount: 45000,
          amountMinor: 4500000,
          currency: 'NGN',
          category: 'inventory',
          rawInput: 'Stock purchase',
          date: new Date('2026-10-10T11:00:00.000Z'),
          type: 'expense',
        },
      ];

      const formatted = formatTransactionsChat(expenseOnlyRecords, 'daily', {
        timezone: 'UTC',
      });

      expect(formatted).toContain('📅 *Transactions (Today)*');
      expect(formatted).toContain('• [10/10] ₦45,000 — Inventory ("Stock purchase")');
      expect(formatted).toContain('Total In: ₦0');
      expect(formatted).toContain('Total Out: ₦45,000');
      expect(formatted).toContain('Net Balance: -₦45,000');
    });

    it('formats monthly header correctly', () => {
      const records: EnrichedTransactionRecord[] = [
        {
          id: 'rec_5',
          _id: new Types.ObjectId(),
          amount: 10000,
          amountMinor: 1000000,
          currency: 'NGN',
          category: 'utilities',
          rawInput: 'Electricity bill',
          date: new Date('2026-09-20T10:00:00.000Z'),
          type: 'expense',
        },
      ];

      const formatted = formatTransactionsChat(records, 'monthly', {
        timezone: 'UTC',
      });

      expect(formatted).toContain('📅 *Transactions (Last 30 Days)*');
      expect(formatted).toContain('• [20/09] ₦10,000 — Utilities ("Electricity bill")');
      expect(formatted).toContain('Total In: ₦0');
      expect(formatted).toContain('Total Out: ₦10,000');
      expect(formatted).toContain('Net Balance: -₦10,000');
    });
  });

  // ── 6. End-to-End Helper Integration ────────────────────────────────
  describe('getTimeframeTransactionReport Helper', () => {
    it('fetches and formats report in a single call with structured summary', async () => {
      await Transaction.create({
        userId: user._id,
        type: 'income',
        amount: 8000000, // 80,000 NGN
        currency: 'NGN',
        category: 'sales',
        description: 'Store sales',
        date: new Date('2026-10-10T09:00:00.000Z'),
        source: 'text',
      });

      await Transaction.create({
        userId: user._id,
        type: 'expense',
        amount: 2000000, // 20,000 NGN
        currency: 'NGN',
        category: 'transport',
        description: 'Logistics',
        date: new Date('2026-10-10T10:00:00.000Z'),
        source: 'text',
      });

      const report = await getTimeframeTransactionReport(user._id, 'daily', {
        referenceDate: fixedReferenceDate,
        timezone: 'UTC',
      });

      expect(report.records.length).toBe(2);
      expect(report.summary.totalIn).toBe(80000);
      expect(report.summary.totalOut).toBe(20000);
      expect(report.summary.netBalance).toBe(60000);

      expect(report.formatted).toContain('📅 *Transactions (Today)*');
      expect(report.formatted).toContain('Total In: ₦80,000');
      expect(report.formatted).toContain('Total Out: ₦20,000');
      expect(report.formatted).toContain('Net Balance: ₦60,000');
    });
  });

  // ── 7. Helpers: formatLineDate, getHeaderForPeriod, calculateTimeframeBounds ──
  describe('Helper Functions', () => {
    it('formats line date with zero-padding in [DD/MM] format', () => {
      expect(formatLineDate(new Date('2026-03-05T12:00:00.000Z'), 'UTC')).toBe('[05/03]');
      expect(formatLineDate(new Date('2026-11-28T12:00:00.000Z'), 'UTC')).toBe('[28/11]');
      expect(formatLineDate('invalid-date')).toBe('[--/--]');
    });

    it('returns appropriate header titles for all supported periods', () => {
      expect(getHeaderForPeriod('daily')).toBe('📅 *Transactions (Today)*');
      expect(getHeaderForPeriod('weekly')).toBe('📅 *Transactions (Last 7 Days)*');
      expect(getHeaderForPeriod('monthly')).toBe('📅 *Transactions (Last 30 Days)*');
    });

    it('computes exact timeframe bounds for daily, weekly, and monthly', () => {
      const dailyBounds = calculateTimeframeBounds('daily', {
        referenceDate: fixedReferenceDate,
        timezone: 'UTC',
      });
      expect(dailyBounds.startDate.toISOString()).toBe('2026-10-10T00:00:00.000Z');

      const weeklyBounds = calculateTimeframeBounds('weekly', {
        referenceDate: fixedReferenceDate,
        timezone: 'UTC',
      });
      expect(weeklyBounds.startDate.toISOString()).toBe('2026-10-03T00:00:00.000Z');

      const monthlyBounds = calculateTimeframeBounds('monthly', {
        referenceDate: fixedReferenceDate,
        timezone: 'UTC',
      });
      expect(monthlyBounds.startDate.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    });
  });
});
