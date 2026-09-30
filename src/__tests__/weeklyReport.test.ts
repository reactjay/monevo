import axios from 'axios';
import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import { Transaction } from '../models/Transaction';
import { WeeklyReport } from '../models/WeeklyReport';
import {
  getWeekDateRange,
  getWeeklyAggregatedData,
  createAndStoreWeeklyReport,
  sendWeeklyReportToWhatsApp,
  renderReportPng,
} from '../services/analytics/reportService';
import {
  generateWeeklyReportSvg,
  WeeklyReportTemplateData,
} from '../services/analytics/reportTemplate';
import { generateReportTool } from '../services/tools/generateReportTool';
import { runWeeklyReportsJob } from '../jobs/weeklyReportJob';
import { extractIntent } from '../services/ai/intentExtractor';
import { dispatchIntent } from '../services/tools/toolDispatcher';
import * as whatsappClient from '../services/whatsapp/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

let testUser: IUserDocument;
let businessUser: IUserDocument;

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();

  // Create personal test user
  testUser = await User.create({
    whatsappId: '2348011223344',
    name: 'Ada Lovelace',
    profileType: 'personal',
    currency: 'NGN',
    onboardingComplete: true,
    weeklyReportsEnabled: true,
  });

  // Create business test user
  businessUser = await User.create({
    whatsappId: '2348099887766',
    name: 'Chidi Anagonye',
    businessName: 'Anagonye Tech Labs',
    profileType: 'business',
    currency: 'NGN',
    onboardingComplete: true,
    weeklyReportsEnabled: true,
  });
});

describe('Phase 12: Weekly Visual Analytics Report', () => {
  // ── 1. Date Range & Period Calculation ────────────────────────────
  describe('Date Range Calculation', () => {
    it('computes Monday 00:00 to Sunday 23:59 for a Wednesday reference date', () => {
      // 2026-09-09 is a Wednesday
      const wednesday = new Date('2026-09-09T14:30:00Z');
      const range = getWeekDateRange(wednesday);

      expect(range.weekStart.getDay()).toBe(1); // Monday
      expect(range.weekEnd.getDay()).toBe(0); // Sunday
      expect(range.periodLabel).toContain('7 Sep → 13 Sep 2026');
    });

    it('computes correct range when reference date is Sunday', () => {
      // 2026-09-13 is Sunday
      const sunday = new Date('2026-09-13T20:00:00Z');
      const range = getWeekDateRange(sunday);

      expect(range.weekStart.getDay()).toBe(1); // Monday
      expect(range.weekEnd.getDay()).toBe(0); // Sunday
      expect(range.periodLabel).toContain('7 Sep → 13 Sep 2026');
    });
  });

  // ── 2. SVG Template Rendering ─────────────────────────────────────
  describe('SVG Report Template', () => {
    it('generates rich SVG for a user with transactions', () => {
      const templateData: WeeklyReportTemplateData = {
        recipientName: 'Ada Lovelace',
        isBusiness: false,
        currency: 'NGN',
        periodLabel: '7 Sep → 13 Sep 2026',
        totalIncome: 350000,
        formattedIncome: '₦350,000',
        totalExpenses: 120000,
        formattedExpenses: '₦120,000',
        net: 230000,
        formattedNet: '₦230,000',
        transactionCount: 8,
        topCategories: [
          { category: 'food', amount: 50000, count: 4 },
          { category: 'transport', amount: 40000, count: 2 },
          { category: 'fuel', amount: 30000, count: 2 },
        ],
        generatedAtStr: '11 Sep 2026',
      };

      const svg = generateWeeklyReportSvg(templateData);

      expect(svg).toContain('<svg');
      expect(svg).toContain('WEEKLY FINANCIAL INTELLIGENCE');
      expect(svg).toContain('Ada Lovelace');
      expect(svg).toContain('₦350,000');
      expect(svg).toContain('₦120,000');
      expect(svg).toContain('₦230,000');
      expect(svg).toContain('Food');
      expect(svg).toContain('Transport');
      expect(svg).toContain('Fuel');
      expect(svg).toContain('</svg>');
    });

    it('renders empty state gracefully when no expenses or income exist', () => {
      const templateData: WeeklyReportTemplateData = {
        recipientName: 'Ada Lovelace',
        isBusiness: false,
        currency: 'NGN',
        periodLabel: '7 Sep → 13 Sep 2026',
        totalIncome: 0,
        formattedIncome: '₦0',
        totalExpenses: 0,
        formattedExpenses: '₦0',
        net: 0,
        formattedNet: '₦0',
        transactionCount: 0,
        topCategories: [],
        generatedAtStr: '11 Sep 2026',
      };

      const svg = generateWeeklyReportSvg(templateData);
      expect(svg).toContain('No expense transactions recorded');
      expect(svg).toContain('No cashflow activity recorded');
    });
  });

  // ── 3. Sharp PNG Conversion ───────────────────────────────────────
  describe('PNG Image Conversion', () => {
    it('converts weekly report SVG to valid PNG buffer', async () => {
      const templateData: WeeklyReportTemplateData = {
        recipientName: 'Ada Lovelace',
        isBusiness: false,
        currency: 'NGN',
        periodLabel: '7 Sep → 13 Sep 2026',
        totalIncome: 100000,
        formattedIncome: '₦100,000',
        totalExpenses: 40000,
        formattedExpenses: '₦40,000',
        net: 60000,
        formattedNet: '₦60,000',
        transactionCount: 3,
        topCategories: [{ category: 'food', amount: 40000, count: 3 }],
        generatedAtStr: '11 Sep 2026',
      };

      const svg = generateWeeklyReportSvg(templateData);
      const pngBuffer = await renderReportPng(svg);

      expect(Buffer.isBuffer(pngBuffer)).toBe(true);
      expect(pngBuffer.length).toBeGreaterThan(1000);

      // Verify PNG magic bytes
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(pngBuffer.subarray(0, 8)).toEqual(pngHeader);
    });
  });

  // ── 4. Report Generation Scenarios ────────────────────────────────
  describe('Report Generation Scenarios', () => {
    const fixedDate = new Date('2026-09-09T12:00:00Z'); // Wednesday inside 7 Sep - 13 Sep

    it('generates report with transactions (income + multiple expenses)', async () => {
      // Seed income and expenses
      await Transaction.create([
        {
          userId: testUser._id,
          type: 'income',
          amount: 250000,
          currency: 'NGN',
          category: 'sales',
          date: fixedDate,
          source: 'text',
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 40000,
          currency: 'NGN',
          category: 'food',
          date: fixedDate,
          source: 'text',
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 25000,
          currency: 'NGN',
          category: 'transport',
          date: fixedDate,
          source: 'text',
        },
      ]);

      const result = await createAndStoreWeeklyReport(testUser, { referenceDate: fixedDate });

      expect(result.data.totalIncome).toBe(250000);
      expect(result.data.totalExpenses).toBe(65000);
      expect(result.data.net).toBe(185000);
      expect(result.data.transactionCount).toBe(3);
      expect(result.data.topCategories.length).toBe(2);
      expect(result.data.topCategories[0].category).toBe('food');
      expect(result.data.topCategories[0].amount).toBe(40000);

      // Verify MongoDB persistence
      const saved = await WeeklyReport.findOne({ userId: testUser._id });
      expect(saved).not.toBeNull();
      expect(saved!.totalIncome).toBe(250000);
      expect(saved!.totalExpenses).toBe(65000);
      expect(saved!.net).toBe(185000);
    });

    it('generates report for business user with business branding', async () => {
      await Transaction.create({
        userId: businessUser._id,
        type: 'income',
        amount: 1500000,
        currency: 'NGN',
        category: 'freelance',
        date: fixedDate,
        source: 'text',
      });

      const result = await createAndStoreWeeklyReport(businessUser, { referenceDate: fixedDate });

      expect(result.svg).toContain('Anagonye Tech Labs');
      expect(result.data.totalIncome).toBe(1500000);
      expect(result.data.net).toBe(1500000);
    });

    it('retrieves aggregated weekly data directly using getWeeklyAggregatedData', async () => {
      const range = getWeekDateRange(fixedDate);
      await Transaction.create({
        userId: testUser._id,
        type: 'expense',
        amount: 15000,
        currency: 'NGN',
        category: 'food',
        date: fixedDate,
        source: 'text',
      });

      const agg = await getWeeklyAggregatedData(testUser._id, range.weekStart, range.weekEnd);
      expect(agg.totalExpenses).toBe(15000);
      expect(agg.topCategories[0].category).toBe('food');
    });

    it('generates report with no transactions (empty state)', async () => {
      const result = await createAndStoreWeeklyReport(testUser, { referenceDate: fixedDate });

      expect(result.data.totalIncome).toBe(0);
      expect(result.data.totalExpenses).toBe(0);
      expect(result.data.net).toBe(0);
      expect(result.data.transactionCount).toBe(0);
      expect(result.data.topCategories.length).toBe(0);
      expect(result.pngBuffer.length).toBeGreaterThan(0);

      const saved = await WeeklyReport.findOne({ userId: testUser._id });
      expect(saved).not.toBeNull();
      expect(saved!.transactionCount).toBe(0);
    });

    it('generates report with income only', async () => {
      await Transaction.create({
        userId: testUser._id,
        type: 'income',
        amount: 500000,
        currency: 'NGN',
        category: 'salary',
        date: fixedDate,
        source: 'text',
      });

      const result = await createAndStoreWeeklyReport(testUser, { referenceDate: fixedDate });

      expect(result.data.totalIncome).toBe(500000);
      expect(result.data.totalExpenses).toBe(0);
      expect(result.data.net).toBe(500000);
      expect(result.data.transactionCount).toBe(1);
      expect(result.data.topCategories.length).toBe(0);
    });

    it('generates report with expenses only (negative net balance)', async () => {
      await Transaction.create([
        {
          userId: testUser._id,
          type: 'expense',
          amount: 30000,
          currency: 'NGN',
          category: 'fuel',
          date: fixedDate,
          source: 'text',
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 20000,
          currency: 'NGN',
          category: 'groceries',
          date: fixedDate,
          source: 'text',
        },
      ]);

      const result = await createAndStoreWeeklyReport(testUser, { referenceDate: fixedDate });

      expect(result.data.totalIncome).toBe(0);
      expect(result.data.totalExpenses).toBe(50000);
      expect(result.data.net).toBe(-50000);
      expect(result.data.transactionCount).toBe(2);
      expect(result.data.topCategories.length).toBe(2);
    });
  });

  // ── 5. Tool Dispatcher & WhatsApp Delivery ────────────────────────
  describe('Tool Dispatcher & WhatsApp Delivery', () => {
    it('dispatches weekly_report query and returns formatted WhatsApp response', async () => {
      const uploadMediaSpy = jest
        .spyOn(whatsappClient, 'uploadMedia')
        .mockResolvedValue('mock_weekly_media_id_999');
      const sendImageSpy = jest
        .spyOn(whatsappClient, 'sendImageMessage')
        .mockResolvedValue(undefined);

      const intent = await extractIntent('Send my weekly report.');
      expect(intent.intent).toBe('financial_query');
      if (intent.intent === 'financial_query') {
        expect(intent.queryType).toBe('weekly_report');
      }

      const response = await dispatchIntent(intent, {
        user: testUser,
        source: 'text',
        whatsappMessageId: 'wamid.rep001',
      });

      expect(response).toContain('Weekly Financial Report Generated!');
      expect(response).toContain('Total Income:');
      expect(response).toContain('Total Expenses:');
      expect(response).toContain('Net Savings:');
      expect(uploadMediaSpy).toHaveBeenCalledTimes(1);
      expect(sendImageSpy).toHaveBeenCalledWith(
        testUser.whatsappId,
        'mock_weekly_media_id_999',
        expect.stringContaining('Weekly Financial Report')
      );

      uploadMediaSpy.mockRestore();
      sendImageSpy.mockRestore();
    });

    it('recognizes "Show my weekly analytics" voice/text query', async () => {
      const intent = await extractIntent('Show my weekly analytics.');
      expect(intent.intent).toBe('financial_query');
      if (intent.intent === 'financial_query') {
        expect(intent.queryType).toBe('weekly_report');
      }
    });

    it('sends weekly report directly via sendWeeklyReportToWhatsApp', async () => {
      mockedAxios.post.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/media')) {
          return Promise.resolve({ data: { id: 'media_weekly_abc123' } });
        }
        return Promise.resolve({ data: { messages: [{ id: 'wamid.weekly001' }] } });
      });

      const reportResult = await createAndStoreWeeklyReport(testUser, {
        referenceDate: new Date('2026-09-09T12:00:00Z'),
      });

      const mediaId = await sendWeeklyReportToWhatsApp(testUser, reportResult);
      expect(mediaId).toBe('media_weekly_abc123');

      const updated = await WeeklyReport.findById(reportResult.report._id);
      expect(updated?.imageReference).toBe('media_weekly_abc123');
    });

    it('handles WhatsApp delivery failure gracefully without crashing', async () => {
      jest.spyOn(whatsappClient, 'uploadMedia').mockRejectedValue(new Error('Meta API 500'));

      const result = await generateReportTool({
        user: testUser,
        period: 'this_week',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Weekly Financial Report Generated!');

      jest.restoreAllMocks();
    });
  });

  // ── 6. Weekly Scheduler Job ───────────────────────────────────────
  describe('Weekly Scheduler Job', () => {
    it('identifies eligible users and dispatches weekly reports to each', async () => {
      // Non-eligible user (onboarding incomplete)
      await User.create({
        whatsappId: '2348000000001',
        profileType: 'personal',
        onboardingComplete: false,
      });

      // Disabled user
      await User.create({
        whatsappId: '2348000000002',
        profileType: 'personal',
        onboardingComplete: true,
        weeklyReportsEnabled: false,
      });

      const uploadMediaSpy = jest
        .spyOn(whatsappClient, 'uploadMedia')
        .mockResolvedValue('mock_media_id_cron');
      const sendImageSpy = jest
        .spyOn(whatsappClient, 'sendImageMessage')
        .mockResolvedValue(undefined);

      const summary = await runWeeklyReportsJob();

      // Only testUser and businessUser should be processed (total 2)
      expect(summary.totalUsers).toBe(2);
      expect(summary.successCount).toBe(2);
      expect(summary.errorCount).toBe(0);
      expect(uploadMediaSpy).toHaveBeenCalledTimes(2);
      expect(sendImageSpy).toHaveBeenCalledTimes(2);

      uploadMediaSpy.mockRestore();
      sendImageSpy.mockRestore();
    });
  });
});
