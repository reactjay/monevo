import request from 'supertest';
import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { app } from '../app';
import { User, IUserDocument } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Receipt } from '../models/Receipt';
import { WeeklyReport } from '../models/WeeklyReport';
import { handleTextMessage } from '../handlers/textHandler';
import { handleAudioMessage } from '../handlers/audioHandler';
import { getBalance } from '../services/tools/getBalance';
import { getTransactions } from '../services/tools/getTransactions';
import { getComprehensiveAnalytics } from '../services/analytics/analyticsService';
import { createAndStoreWeeklyReport } from '../services/analytics/reportService';
import { createAndStoreReceipt } from '../services/receipts/receiptService';
import { isMessageProcessed, markMessageProcessed, clearProcessedMessageCache } from '../utils/idempotency';
import * as whatsappClient from '../services/whatsapp/client';
import * as assemblyaiService from '../services/assemblyai/assemblyai.service';

let userA: IUserDocument;
let userB: IUserDocument;
let businessUser: IUserDocument;

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  clearProcessedMessageCache();
  jest.clearAllMocks();

  // User A (Personal)
  userA = await User.create({
    whatsappId: '2348000000001',
    name: 'Alice Personal',
    profileType: 'personal',
    currency: 'NGN',
    onboardingComplete: true,
    responseMode: 'text',
  });

  // User B (Personal)
  userB = await User.create({
    whatsappId: '2348000000002',
    name: 'Bob Personal',
    profileType: 'personal',
    currency: 'USD',
    onboardingComplete: true,
    responseMode: 'text',
  });

  // Business User
  businessUser = await User.create({
    whatsappId: '2348000000003',
    name: 'Charlie Founder',
    businessName: 'Charlie Ventures Ltd',
    profileType: 'business',
    currency: 'NGN',
    onboardingComplete: true,
    responseMode: 'voice',
  });
});

describe('Phase 14: Reliability, Security & End-to-End Checklist', () => {
  // ── 1. User Isolation & Security ──────────────────────────────────
  describe('User Isolation & Multi-Tenancy Security', () => {
    it('strictly isolates financial transactions, balances, and analytics between users', async () => {
      // Seed User A transactions
      await Transaction.create([
        {
          userId: userA._id,
          type: 'income',
          amount: 500000,
          currency: 'NGN',
          category: 'salary',
          date: new Date(),
          source: 'text',
        },
        {
          userId: userA._id,
          type: 'expense',
          amount: 150000,
          currency: 'NGN',
          category: 'rent',
          date: new Date(),
          source: 'text',
        },
      ]);

      // Seed User B transactions
      await Transaction.create([
        {
          userId: userB._id,
          type: 'income',
          amount: 1000,
          currency: 'USD',
          category: 'freelance',
          date: new Date(),
          source: 'text',
        },
      ]);

      // User A balance check
      const balA = await getBalance(userA._id, 'NGN');
      expect(balA.totalIncome).toBe(500000);
      expect(balA.totalExpenses).toBe(150000);
      expect(balA.balance).toBe(350000);

      // User B balance check - must NEVER see User A data
      const balB = await getBalance(userB._id, 'USD');
      expect(balB.totalIncome).toBe(1000);
      expect(balB.totalExpenses).toBe(0);
      expect(balB.balance).toBe(1000);

      // Verify transaction queries are isolated
      const txsA = await getTransactions({ userId: userA._id });
      const txsB = await getTransactions({ userId: userB._id });
      expect(txsA.length).toBe(2);
      expect(txsB.length).toBe(1);
      expect(txsB[0].amount).toBe(1000);

      // Verify analytics aggregations are isolated
      const analyticsA = await getComprehensiveAnalytics(userA._id, 'this_month');
      const analyticsB = await getComprehensiveAnalytics(userB._id, 'this_month');
      expect(analyticsA.totalIncome).toBe(500000);
      expect(analyticsB.totalIncome).toBe(1000);
    });

    it('strictly isolates receipts and weekly reports between users', async () => {
      const receiptA = await createAndStoreReceipt({
        user: userA,
        payer: 'David',
        amount: 50000,
        currency: 'NGN',
        description: 'Design consulting',
      });

      const reportB = await createAndStoreWeeklyReport(userB, {
        referenceDate: new Date(),
      });

      // User B searching for receipts
      const userBReceipts = await Receipt.find({ userId: userB._id });
      expect(userBReceipts.length).toBe(0);

      // User A searching for weekly reports
      const userAReports = await WeeklyReport.find({ userId: userA._id });
      expect(userAReports.length).toBe(0);

      expect(receiptA.receipt.userId.toString()).toBe(userA._id.toString());
      expect(reportB.report.userId.toString()).toBe(userB._id.toString());
    });
  });

  // ── 2. Idempotency & Webhook Retries ──────────────────────────────
  describe('Idempotency & Duplicate Webhook Handling', () => {
    it('prevents double recording of transactions on duplicate webhook delivery', async () => {
      const sendTextSpy = jest
        .spyOn(whatsappClient, 'sendTextMessage')
        .mockResolvedValue(undefined);

      const msgId = 'wamid.idemp001';

      // First webhook delivery
      const webhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '123456789',
                    phone_number_id: '987654321',
                  },
                  contacts: [{ profile: { name: 'Alice' }, wa_id: userA.whatsappId }],
                  messages: [
                    {
                      from: userA.whatsappId,
                      id: msgId,
                      timestamp: '1690000000',
                      text: { body: 'Spent 15000 on fuel today' },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      const res1 = await request(app).post('/webhook/whatsapp').send(webhookPayload);
      expect(res1.status).toBe(200);

      const txCount1 = await Transaction.countDocuments({ userId: userA._id });
      expect(txCount1).toBe(1);

      // Duplicate retry from Meta
      const res2 = await request(app).post('/webhook/whatsapp').send(webhookPayload);
      expect(res2.status).toBe(200);

      // Verify no duplicate transaction was created
      const txCount2 = await Transaction.countDocuments({ userId: userA._id });
      expect(txCount2).toBe(1);

      sendTextSpy.mockRestore();
    });

    it('tracks processed non-transaction messages in high-speed idempotency cache', async () => {
      markMessageProcessed('wamid.query999');
      const isDuplicate = await isMessageProcessed('wamid.query999');
      expect(isDuplicate).toBe(true);

      const isNew = await isMessageProcessed('wamid.new001');
      expect(isNew).toBe(false);
    });
  });

  // ── 3. End-to-End Checklist Flows ─────────────────────────────────
  describe('End-to-End Core Feature Matrix', () => {
    let sendTextSpy: jest.SpyInstance;
    let sendAudioSpy: jest.SpyInstance;
    let uploadMediaSpy: jest.SpyInstance;

    beforeEach(() => {
      sendTextSpy = jest
        .spyOn(whatsappClient, 'sendTextMessage')
        .mockResolvedValue(undefined);
      sendAudioSpy = jest
        .spyOn(whatsappClient, 'sendAudioMessage')
        .mockResolvedValue(undefined);
      uploadMediaSpy = jest
        .spyOn(whatsappClient, 'uploadMedia')
        .mockResolvedValue('mock_e2e_media_id');
    });

    afterEach(() => {
      sendTextSpy.mockRestore();
      sendAudioSpy.mockRestore();
      uploadMediaSpy.mockRestore();
    });

    // 3a. New User Onboarding
    it('E2E: New user onboarding flow', async () => {
      await handleTextMessage({
        senderId: '2348199999999',
        messageId: 'wamid.new_user_01',
        timestamp: new Date(),
        type: 'text',
        text: 'Hi',
      });

      expect(sendTextSpy).toHaveBeenCalledWith(
        '2348199999999',
        expect.stringContaining('Personal finances')
      );
    });

    // 3b. Text Expense
    it('E2E: Text expense recording', async () => {
      await handleTextMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.text_exp_01',
        timestamp: new Date(),
        type: 'text',
        text: 'Spent 12000 on fuel today',
      });

      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining('12,000')
      );

      const saved = await Transaction.findOne({ userId: userA._id, category: 'fuel' });
      expect(saved).not.toBeNull();
      expect(saved!.amount).toBe(12000);
      expect(saved!.type).toBe('expense');
    });

    // 3c. Text Income
    it('E2E: Text income recording', async () => {
      await handleTextMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.text_inc_01',
        timestamp: new Date(),
        type: 'text',
        text: 'Received 150000 from David for consulting',
      });

      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining('150,000')
      );

      const saved = await Transaction.findOne({ userId: userA._id, counterparty: 'David' });
      expect(saved).not.toBeNull();
      expect(saved!.type).toBe('income');
    });

    // 3d. Voice Expense
    it('E2E: Voice expense recording', async () => {
      jest.spyOn(whatsappClient, 'downloadWhatsAppAudio').mockResolvedValue({
        buffer: Buffer.from('mock_voice_bytes'),
        mimeType: 'audio/ogg',
      });
      jest.spyOn(assemblyaiService, 'transcribeAudio').mockResolvedValue({
        transcript: 'I spent eight thousand on groceries',
        confidence: 0.96,
      });

      await handleAudioMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.voice_exp_01',
        timestamp: new Date(),
        type: 'audio',
        audioMediaId: 'audio_media_exp_01',
      });

      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining('8,000')
      );

      const saved = await Transaction.findOne({ userId: userA._id, amount: 8000 });
      expect(saved).not.toBeNull();
      expect(saved!.source).toBe('voice');
    });

    // 3e. Voice Income
    it('E2E: Voice income recording', async () => {
      jest.spyOn(whatsappClient, 'downloadWhatsAppAudio').mockResolvedValue({
        buffer: Buffer.from('mock_voice_bytes'),
        mimeType: 'audio/ogg',
      });
      jest.spyOn(assemblyaiService, 'transcribeAudio').mockResolvedValue({
        transcript: 'I received two hundred thousand naira from Globex',
        confidence: 0.98,
      });

      await handleAudioMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.voice_inc_01',
        timestamp: new Date(),
        type: 'audio',
        audioMediaId: 'audio_media_inc_01',
      });

      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining('200,000')
      );

      const saved = await Transaction.findOne({ userId: userA._id, amount: 200000 });
      expect(saved).not.toBeNull();
      expect(saved!.type).toBe('income');
    });

    // 3f. Financial Queries
    it('E2E: Financial queries (balance, period summary, largest expense)', async () => {
      await Transaction.create([
        {
          userId: userA._id,
          type: 'income',
          amount: 300000,
          currency: 'NGN',
          category: 'sales',
          date: new Date(),
          source: 'text',
        },
        {
          userId: userA._id,
          type: 'expense',
          amount: 45000,
          currency: 'NGN',
          category: 'inventory',
          date: new Date(),
          source: 'text',
        },
      ]);

      // Query balance
      await handleTextMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.q_bal_01',
        timestamp: new Date(),
        type: 'text',
        text: 'What is my balance?',
      });
      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining('Balance')
      );

      // Query biggest expense
      await handleTextMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.q_max_01',
        timestamp: new Date(),
        type: 'text',
        text: 'What is my biggest expense?',
      });
      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining('Inventory')
      );
    });

    // 3g. Receipt Generation
    it('E2E: Professional Receipt Generation', async () => {
      await handleTextMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.rec_01',
        timestamp: new Date(),
        type: 'text',
        text: 'Create a receipt for ₦150,000 received from David for website development.',
      });

      expect(uploadMediaSpy).toHaveBeenCalled();
      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining('Receipt Generated Successfully!')
      );

      const receipt = await Receipt.findOne({ userId: userA._id, payer: 'David' });
      expect(receipt).not.toBeNull();
      expect(receipt!.amount).toBe(150000);
    });

    // 3h. Weekly Report Generation
    it('E2E: Weekly Visual Analytics Report', async () => {
      await handleTextMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.rep_01',
        timestamp: new Date(),
        type: 'text',
        text: 'Send my weekly report.',
      });

      expect(uploadMediaSpy).toHaveBeenCalled();
      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining('Weekly Financial Report Generated!')
      );

      const report = await WeeklyReport.findOne({ userId: userA._id });
      expect(report).not.toBeNull();
    });

    // 3i. Voice Response Mode (Business User in Voice Mode)
    it('E2E: Voice response mode delivery', async () => {
      await handleTextMessage({
        senderId: businessUser.whatsappId,
        messageId: 'wamid.biz_voice_01',
        timestamp: new Date(),
        type: 'text',
        text: 'What is my balance?',
      });

      expect(sendAudioSpy).toHaveBeenCalledWith(
        businessUser.whatsappId,
        'mock_e2e_media_id'
      );
    });

    // 3j. Missing Amount Clarification
    it('E2E: Missing amount triggers clarification required', async () => {
      await handleTextMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.clarify_01',
        timestamp: new Date(),
        type: 'text',
        text: 'I spent money on fuel',
      });

      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining('How much did you spend on fuel?')
      );
    });
  });

  // ── 4. Error Handling & Edge Cases ────────────────────────────────
  describe('Error Handling & Infrastructure Readiness', () => {
    it('gracefully handles non-WhatsApp payloads without error', async () => {
      const res = await request(app).post('/webhook/whatsapp').send({ invalid: 'data' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });

    it('handles Meta API failure gracefully without crashing the webhook', async () => {
      jest.spyOn(whatsappClient, 'sendTextMessage').mockRejectedValue(new Error('Meta Graph API 500'));

      const res = await request(app).post('/webhook/whatsapp').send({
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { display_phone_number: '123', phone_number_id: '456' },
                  contacts: [{ profile: { name: 'Alice' }, wa_id: userA.whatsappId }],
                  messages: [
                    {
                      from: userA.whatsappId,
                      id: 'wamid.fail_01',
                      timestamp: '1690000000',
                      text: { body: 'Hello' },
                      type: 'text',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      });

      // Always returns 200 to prevent Meta webhook retries loop on backend error
      expect(res.status).toBe(200);
    });

    it('handles unknown intent naturally', async () => {
      const sendTextSpy = jest
        .spyOn(whatsappClient, 'sendTextMessage')
        .mockResolvedValue(undefined);

      await handleTextMessage({
        senderId: userA.whatsappId,
        messageId: 'wamid.unknown_01',
        timestamp: new Date(),
        type: 'text',
        text: 'asdkjhqwueyasuydgasjd',
      });

      expect(sendTextSpy).toHaveBeenCalledWith(
        userA.whatsappId,
        expect.stringContaining("didn't quite catch that")
      );

      sendTextSpy.mockRestore();
    });

    it('GET /health reports service readiness', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('whatsapp-financial-agent');
      expect(res.body.database).toBe('connected');
    });
  });
});
