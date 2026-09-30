import mongoose from 'mongoose';
import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User } from '../models/User';
import { Transaction } from '../models/Transaction';
import { ConversationState } from '../models/ConversationState';

beforeAll(async () => {
  await connectTestDb();
}, 60000); // allow up to 60s for first-time binary download

afterAll(async () => {
  await disconnectTestDb();
});

afterEach(async () => {
  await clearTestDb();
});

// ── User model ────────────────────────────────────────────────

describe('User model', () => {
  it('creates a user with required fields', async () => {
    const user = await User.create({
      whatsappId: '2348100000001',
      profileType: 'personal',
    });

    expect(user.whatsappId).toBe('2348100000001');
    expect(user.profileType).toBe('personal');
    expect(user.currency).toBe('NGN');
    expect(user.onboardingComplete).toBe(false);
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('creates a business user with all optional fields', async () => {
    const user = await User.create({
      whatsappId: '2348100000002',
      profileType: 'business',
      name: 'Jane Smith',
      phone: '+234810000002',
      businessName: 'Smith Ventures',
      businessAddress: '1 Marina Street, Lagos',
      currency: 'NGN',
      onboardingComplete: true,
    });

    expect(user.businessName).toBe('Smith Ventures');
    expect(user.onboardingComplete).toBe(true);
  });

  it('rejects a duplicate whatsappId', async () => {
    await User.create({ whatsappId: 'duplicate-id', profileType: 'personal' });

    await expect(
      User.create({ whatsappId: 'duplicate-id', profileType: 'business' })
    ).rejects.toThrow();
  });

  it('rejects an invalid profileType', async () => {
    await expect(
      User.create({ whatsappId: 'bad-profile', profileType: 'corporation' as 'personal' })
    ).rejects.toThrow();
  });

  it('requires whatsappId', async () => {
    await expect(
      User.create({ profileType: 'personal' } as Parameters<typeof User.create>[0])
    ).rejects.toThrow();
  });

  it('defaults currency to NGN', async () => {
    const user = await User.create({ whatsappId: 'no-currency', profileType: 'personal' });
    expect(user.currency).toBe('NGN');
  });
});

// ── Transaction model ─────────────────────────────────────────

describe('Transaction model', () => {
  let userId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const user = await User.create({ whatsappId: 'txn-user', profileType: 'personal' });
    userId = user._id as mongoose.Types.ObjectId;
  });

  it('creates a valid expense transaction', async () => {
    const txn = await Transaction.create({
      userId,
      type: 'expense',
      amount: 12000,
      currency: 'NGN',
      category: 'fuel',
      description: 'Fuel for car',
      date: new Date(),
      source: 'text',
      whatsappMessageId: 'wamid.test001',
    });

    expect(txn.type).toBe('expense');
    expect(txn.amount).toBe(12000);
    expect(txn.category).toBe('fuel');
    expect(txn.currency).toBe('NGN');
  });

  it('creates a valid income transaction', async () => {
    const txn = await Transaction.create({
      userId,
      type: 'income',
      amount: 150000,
      currency: 'NGN',
      category: 'payment',
      description: 'Website payment from David',
      counterparty: 'David',
      date: new Date(),
      source: 'voice',
      transcript: 'I received 150 thousand from David for the website',
      whatsappMessageId: 'wamid.test002',
    });

    expect(txn.type).toBe('income');
    expect(txn.counterparty).toBe('David');
    expect(txn.source).toBe('voice');
    expect(txn.transcript).toBeDefined();
  });

  it('rejects an amount of zero', async () => {
    await expect(
      Transaction.create({
        userId,
        type: 'expense',
        amount: 0,
        currency: 'NGN',
        category: 'food',
        date: new Date(),
        source: 'text',
      })
    ).rejects.toThrow();
  });

  it('rejects a negative amount', async () => {
    await expect(
      Transaction.create({
        userId,
        type: 'expense',
        amount: -500,
        currency: 'NGN',
        category: 'food',
        date: new Date(),
        source: 'text',
      })
    ).rejects.toThrow();
  });

  it('rejects an invalid transaction type', async () => {
    await expect(
      Transaction.create({
        userId,
        type: 'transfer' as 'income',
        amount: 5000,
        currency: 'NGN',
        category: 'other',
        date: new Date(),
        source: 'text',
      })
    ).rejects.toThrow();
  });

  it('rejects a duplicate whatsappMessageId', async () => {
    const shared = {
      userId,
      type: 'expense' as const,
      amount: 500,
      currency: 'NGN',
      category: 'food',
      date: new Date(),
      source: 'text' as const,
      whatsappMessageId: 'wamid.duplicate',
    };

    await Transaction.create(shared);

    await expect(Transaction.create({ ...shared, amount: 999 })).rejects.toThrow();
  });

  it('allows two transactions without a whatsappMessageId (sparse index)', async () => {
    const base = {
      userId,
      type: 'expense' as const,
      amount: 100,
      currency: 'NGN',
      category: 'food',
      date: new Date(),
      source: 'text' as const,
    };

    const a = await Transaction.create(base);
    const b = await Transaction.create(base);

    expect(a._id).not.toEqual(b._id);
  });
});

// ── ConversationState model ───────────────────────────────────

describe('ConversationState model', () => {
  it('creates a state with defaults', async () => {
    const state = await ConversationState.create({ whatsappId: '2348100000003' });

    expect(state.state).toBe('new');
    expect(state.context).toEqual({});
  });

  it('stores arbitrary context data', async () => {
    const state = await ConversationState.create({
      whatsappId: '2348100000004',
      state: 'awaiting_name',
      context: { step: 1, attempt: 0 },
    });

    expect(state.context).toMatchObject({ step: 1 });
  });

  it('rejects a duplicate whatsappId', async () => {
    await ConversationState.create({ whatsappId: 'dup-state' });

    await expect(ConversationState.create({ whatsappId: 'dup-state' })).rejects.toThrow();
  });
});
