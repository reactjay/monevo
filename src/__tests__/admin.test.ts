import request from 'supertest';
import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { app } from '../app';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { Receipt } from '../models/Receipt';
import { WeeklyReport } from '../models/WeeklyReport';

describe('Admin API Endpoints (/api/admin)', () => {
  beforeAll(async () => {
    await connectTestDb();
  }, 60000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Seed test users: one text user, one voice user
    const textUser = await User.create({
      whatsappId: '2348011112222',
      name: 'Amaka Text',
      profileType: 'personal',
      currency: 'NGN',
      responseMode: 'text',
      onboardingComplete: true,
    });

    const voiceUser = await User.create({
      whatsappId: '2348033334444',
      name: 'Emeka Voice',
      phone: '+2348033334444',
      businessName: 'Emeka Logistics Ltd',
      profileType: 'business',
      currency: 'NGN',
      responseMode: 'voice',
      onboardingComplete: true,
    });

    // Seed transactions: text transaction and voice transaction with transcript
    const tx1 = await Transaction.create({
      userId: textUser._id,
      type: 'income',
      amount: 45000,
      currency: 'NGN',
      category: 'sales',
      source: 'text',
      description: 'Web design payment',
      counterparty: 'Client Alpha',
    });

    await Transaction.create({
      userId: voiceUser._id,
      type: 'expense',
      amount: 12000,
      currency: 'NGN',
      category: 'fuel',
      source: 'voice',
      transcript: 'I spent 12000 on fuel for the delivery van',
      description: 'Fuel for delivery van',
    });

    // Seed receipt
    await Receipt.create({
      userId: textUser._id,
      transactionId: tx1._id,
      receiptNumber: 'REC-2026-001',
      payer: 'Client Alpha',
      recipient: 'Amaka Text',
      amount: 45000,
      currency: 'NGN',
      description: 'Web design payment receipt',
    });

    // Seed weekly report
    await WeeklyReport.create({
      userId: voiceUser._id,
      weekStart: new Date('2026-09-20'),
      weekEnd: new Date('2026-09-27'),
      totalIncome: 0,
      totalExpenses: 12000,
      net: -12000,
      transactionCount: 1,
      topCategories: [{ category: 'fuel', amount: 12000, count: 1 }],
    });
  });

  describe('GET /api/admin/overview', () => {
    it('returns high-level KPIs and vital statistics', async () => {
      const res = await request(app).get('/api/admin/overview');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.metrics.users.total).toBe(2);
      expect(res.body.metrics.users.voiceModeCount).toBe(1);
      expect(res.body.metrics.users.textModeCount).toBe(1);
      expect(res.body.metrics.users.businessCount).toBe(1);
      expect(res.body.metrics.users.personalCount).toBe(1);
      expect(res.body.metrics.transactions.total).toBe(2);
      expect(res.body.metrics.transactions.voiceCount).toBe(1);
      expect(res.body.metrics.transactions.textCount).toBe(1);
      expect(res.body.metrics.transactions.totalIncome).toBe(45000);
      expect(res.body.metrics.transactions.totalExpense).toBe(12000);
      expect(res.body.metrics.transactions.netVolume).toBe(33000);
      expect(res.body.metrics.receipts.total).toBe(1);
      expect(res.body.metrics.reports.total).toBe(1);
      expect(res.body.metrics.system.dbStatus).toBe('connected');
    });
  });

  describe('GET /api/admin/users', () => {
    it('returns list of users with metrics', async () => {
      const res = await request(app).get('/api/admin/users');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.users).toHaveLength(2);
      expect(res.body.pagination.totalCount).toBe(2);
    });

    it('filters users by responseMode=voice', async () => {
      const res = await request(app).get('/api/admin/users?responseMode=voice');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].name).toBe('Emeka Voice');
    });

    it('filters users by profileType=business', async () => {
      const res = await request(app).get('/api/admin/users?profileType=business');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].businessName).toBe('Emeka Logistics Ltd');
    });

    it('searches users by name or business', async () => {
      const res = await request(app).get('/api/admin/users?search=Logistics');

      expect(res.status).toBe(200);
      expect(res.body.users).toHaveLength(1);
      expect(res.body.users[0].name).toBe('Emeka Voice');
    });
  });

  describe('GET /api/admin/users/:id', () => {
    it('returns detailed profile and transactions for a user', async () => {
      const user = await User.findOne({ name: 'Emeka Voice' });
      const res = await request(app).get(`/api/admin/users/${user!._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.name).toBe('Emeka Voice');
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.voiceTransactions).toHaveLength(1);
      expect(res.body.weeklyReports).toHaveLength(1);
    });

    it('returns 400 for invalid user id', async () => {
      const res = await request(app).get('/api/admin/users/not-valid-id');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent user id', async () => {
      const res = await request(app).get('/api/admin/users/60c72b2f9b1e8b2b64b19999');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/admin/voice-users', () => {
    it('returns voice intelligence, voice users list, and transcripts', async () => {
      const res = await request(app).get('/api/admin/voice-users');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.summary.totalVoiceUsers).toBeGreaterThanOrEqual(1);
      expect(res.body.summary.totalVoiceTransactions).toBe(1);
      expect(res.body.summary.totalVoiceVolume).toBe(12000);
      expect(res.body.summary.assemblyAiEngine.provider).toContain('AssemblyAI');
      expect(res.body.recentTranscripts).toHaveLength(1);
      expect(res.body.recentTranscripts[0].transcript).toBe(
        'I spent 12000 on fuel for the delivery van'
      );
    });
  });

  describe('GET /api/admin/transactions', () => {
    it('returns all transactions', async () => {
      const res = await request(app).get('/api/admin/transactions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.transactions).toHaveLength(2);
    });

    it('filters transactions by source=voice', async () => {
      const res = await request(app).get('/api/admin/transactions?source=voice');

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.transactions[0].source).toBe('voice');
      expect(res.body.transactions[0].category).toBe('fuel');
    });

    it('filters transactions by type=income', async () => {
      const res = await request(app).get('/api/admin/transactions?type=income');

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.transactions[0].type).toBe('income');
    });
  });

  describe('GET /api/admin/receipts', () => {
    it('returns all generated receipts', async () => {
      const res = await request(app).get('/api/admin/receipts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.receipts).toHaveLength(1);
      expect(res.body.receipts[0].receiptNumber).toBe('REC-2026-001');
    });
  });

  describe('GET /api/admin/reports', () => {
    it('returns weekly reports', async () => {
      const res = await request(app).get('/api/admin/reports');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reports).toHaveLength(1);
    });
  });

  describe('GET /api/admin/analytics', () => {
    it('returns trends timeline and category distributions', async () => {
      const res = await request(app).get('/api/admin/analytics');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.timeline)).toBe(true);
      expect(Array.isArray(res.body.categories)).toBe(true);
      expect(Array.isArray(res.body.sources)).toBe(true);
    });
  });

  describe('GET /api/admin/export', () => {
    it('exports transactions as CSV', async () => {
      const res = await request(app).get('/api/admin/export?type=transactions');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toContain('monevo-transactions.csv');
      expect(res.text).toContain('WhatsApp ID');
      expect(res.text).toContain('fuel');
    });

    it('exports users as CSV', async () => {
      const res = await request(app).get('/api/admin/export?type=users');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toContain('monevo-users.csv');
      expect(res.text).toContain('Amaka Text');
      expect(res.text).toContain('Emeka Voice');
    });

    it('exports voice transcripts as CSV', async () => {
      const res = await request(app).get('/api/admin/export?type=voice-logs');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      expect(res.headers['content-disposition']).toContain('monevo-voice-transcripts.csv');
      expect(res.text).toContain('delivery van');
    });
  });

  describe('Static Admin UI (/admin)', () => {
    it('serves the admin dashboard HTML at /admin/', async () => {
      const res = await request(app).get('/admin/');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.text).toContain('Monevo Admin');
      expect(res.text).toContain('Voice Intelligence Hub');
    });
  });
});

