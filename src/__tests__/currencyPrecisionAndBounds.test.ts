import {
  validateTransactionAmount,
  validateTransaction,
  validateAmount,
  convertToMinorUnits,
  convertToMajorUnits,
  calculateRunningBalance,
  assertValidTransactionAmount,
  TransactionValidationError,
} from '../services/tools/transactionValidator';
import { parseTransaction } from '../services/ai/amountParser';
import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import { recordTransaction } from '../services/tools/recordTransaction';
import { getBalance } from '../services/tools/getBalance';
import { Transaction } from '../models/Transaction';

describe('Currency Precision and Upper/Lower Bound Validation', () => {
  describe('Requirement 1: Migration away from floats to BigInt/Integer strictly in minor units', () => {
    it('converts NGN amounts to Kobo strictly as BigInt (1 NGN = 100 Kobo)', () => {
      const result = validateTransactionAmount(5000, 'NGN');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.amount).toBe(500000n);
        expect(result.amountMinor).toBe(500000n);
        expect(result.amountInteger).toBe(500000);
        expect(Number.isInteger(result.amountInteger)).toBe(true);
        expect(result.currency).toBe('NGN');
        expect(result.minorUnitName).toBe('Kobo');
        expect(result.amountMajor).toBe(5000);
      }
    });

    it('converts USD amounts to Cents strictly as BigInt (1 USD = 100 Cents)', () => {
      const result = validateTransactionAmount(150.5, 'USD');
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.amount).toBe(15050n);
        expect(result.amountMinor).toBe(15050n);
        expect(result.amountInteger).toBe(15050);
        expect(Number.isInteger(result.amountInteger)).toBe(true);
        expect(result.currency).toBe('USD');
        expect(result.minorUnitName).toBe('Cents');
        expect(result.amountMajor).toBe(150.5);
      }
    });

    it('eliminates floating point arithmetic errors (e.g. 19.99, 0.1 + 0.2, 0.07)', () => {
      // 19.99 * 100 in native float is 1998.9999999999998
      const res1 = validateTransactionAmount(19.99, 'USD');
      expect(res1.valid).toBe(true);
      if (res1.valid) {
        expect(res1.amount).toBe(1999n);
        expect(res1.amountInteger).toBe(1999);
      }

      // 0.1 + 0.2 in native float is 0.30000000000000004
      const res2 = validateTransactionAmount(0.1 + 0.2, 'USD');
      expect(res2.valid).toBe(true);
      if (res2.valid) {
        expect(res2.amount).toBe(30n);
        expect(res2.amountInteger).toBe(30);
      }

      // 0.07 * 100 in native float is 7.000000000000001
      const res3 = validateTransactionAmount(0.07, 'NGN');
      expect(res3.valid).toBe(true);
      if (res3.valid) {
        expect(res3.amount).toBe(7n);
        expect(res3.amountInteger).toBe(7);
      }
    });

    it('convertToMinorUnits correctly converts major unit numbers and strings to BigInt', () => {
      expect(convertToMinorUnits(100, 'NGN')).toBe(10000n);
      expect(convertToMinorUnits('100.50', 'USD')).toBe(10050n);
      expect(convertToMinorUnits('5k', 'NGN')).toBe(500000n);
      expect(convertToMinorUnits('1.5m', 'NGN')).toBe(150000000n);
      expect(convertToMinorUnits(25000n, 'NGN')).toBe(25000n);
    });

    it('convertToMajorUnits converts BigInt minor units back to exact major numbers', () => {
      expect(convertToMajorUnits(500000n, 'NGN')).toBe(5000);
      expect(convertToMajorUnits(15050n, 'USD')).toBe(150.5);
    });

    it('calculateRunningBalance computes running balance strictly in minor units as BigInt', () => {
      const initialBalance = 1000000n; // 10,000 NGN in Kobo
      const incomeTxn = 500000n; // 5,000 NGN in Kobo
      const expenseTxn = 300000n; // 3,000 NGN in Kobo

      const afterIncome = calculateRunningBalance(initialBalance, incomeTxn, 'income');
      expect(afterIncome).toBe(1500000n);

      const afterExpense = calculateRunningBalance(afterIncome, expenseTxn, 'expense');
      expect(afterExpense).toBe(1200000n);
    });
  });

  describe('Requirement 2: Sign Validation (Reject <= 0, no sign-flip on negative)', () => {
    it('explicitly rejects zero amount (0)', () => {
      const result = validateTransactionAmount(0, 'NGN');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('NON_POSITIVE_AMOUNT');
      expect(result.error?.toLowerCase()).toContain('strictly positive');
    });

    it('explicitly rejects zero amount as string ("0" and "0.00")', () => {
      const result1 = validateTransactionAmount('0', 'NGN');
      expect(result1.valid).toBe(false);
      expect(result1.error?.toLowerCase()).toContain('strictly positive');

      const result2 = validateTransactionAmount('0.00', 'USD');
      expect(result2.valid).toBe(false);
      expect(result2.error?.toLowerCase()).toContain('strictly positive');
    });

    it('explicitly rejects negative numbers (-5000) and does NOT sign-flip', () => {
      const result = validateTransactionAmount(-5000, 'NGN');
      expect(result.valid).toBe(false);
      expect(result.code).toBe('NON_POSITIVE_AMOUNT');
      expect(result.error?.toLowerCase()).toContain('strictly positive');
      // Must not sign flip to positive 500000
      expect(result.amount).toBeUndefined();
    });

    it('explicitly rejects parsed negative strings (e.g. "-5000", "-50k") without sign-flipping', () => {
      const res1 = validateTransactionAmount('-5000', 'NGN');
      expect(res1.valid).toBe(false);
      expect(res1.code).toBe('NON_POSITIVE_AMOUNT');
      expect(res1.error?.toLowerCase()).toContain('strictly positive');
      expect(res1.error).toContain('-5000');

      const res2 = validateTransactionAmount('-50k', 'NGN');
      expect(res2.valid).toBe(false);
      expect(res2.error?.toLowerCase()).toContain('strictly positive');
    });

    it('parseTransaction does NOT sign-flip negative input and flags validation error', () => {
      const parsed = parseTransaction('spent -5000 on fuel');
      expect(parsed).not.toBeNull();
      expect(parsed?.amount).toBeLessThanOrEqual(0);
      expect(parsed?.amount).toBe(-5000);
      expect(parsed?.valid).toBe(false);
      expect(parsed?.error?.toLowerCase()).toContain('strictly positive');
    });

    it('rejects negative BigInt amounts', () => {
      const result = validateTransactionAmount(-100n, 'NGN');
      expect(result.valid).toBe(false);
      expect(result.error?.toLowerCase()).toContain('strictly positive');
    });
  });

  describe('Requirement 3: Currency-Aware Ceilings', () => {
    describe('NGN Ceilings (10M confirmation, 100M hard reject)', () => {
      it('allows normal amounts <= 10,000,000 NGN without confirmation', () => {
        const res = validateTransactionAmount(5000, 'NGN');
        expect(res.valid).toBe(true);
        expect(res.requires_confirmation).toBe(false);
        expect(res.requiresConfirmation).toBe(false);

        // Boundary at exact 10,000,000 NGN (1,000,000,000 Kobo)
        const boundary = validateTransactionAmount(10_000_000, 'NGN');
        expect(boundary.valid).toBe(true);
        expect(boundary.requires_confirmation).toBe(false);
      });

      it('flags amounts > 10,000,000 NGN (1,000,000,000 Kobo) with requires_confirmation = true', () => {
        // Just over 10M: 10,000,001 NGN
        const res1 = validateTransactionAmount(10_000_001, 'NGN');
        expect(res1.valid).toBe(true);
        expect(res1.requires_confirmation).toBe(true);
        expect(res1.requiresConfirmation).toBe(true);
        if (res1.valid) {
          expect(res1.amount).toBe(1000000100n);
        }

        // 15,000,000 NGN
        const res2 = validateTransactionAmount(15_000_000, 'NGN');
        expect(res2.valid).toBe(true);
        expect(res2.requires_confirmation).toBe(true);
        if (res2.valid) {
          expect(res2.amount).toBe(1500000000n);
        }
      });

      it('flags minor unit inputs > 1,000,000,000 Kobo with requires_confirmation = true', () => {
        const res = validateTransactionAmount(1_500_000_000n, 'NGN');
        expect(res.valid).toBe(true);
        expect(res.requires_confirmation).toBe(true);
        if (res.valid) {
          expect(res.amount).toBe(1500000000n);
          expect(res.amountMajor).toBe(15_000_000);
        }
      });

      it('allows amounts up to exact 100,000,000 NGN (10,000,000,000 Kobo) with confirmation', () => {
        const res = validateTransactionAmount(100_000_000, 'NGN');
        expect(res.valid).toBe(true);
        expect(res.requires_confirmation).toBe(true);
        if (res.valid) {
          expect(res.amount).toBe(10000000000n);
        }
      });

      it('hard rejects amounts > 100,000,000 NGN (10,000,000,000 Kobo) as invalid overflow input', () => {
        // Just over 100M: 100,000,001 NGN
        const res1 = validateTransactionAmount(100_000_001, 'NGN');
        expect(res1.valid).toBe(false);
        expect(res1.code).toBe('OVERFLOW_AMOUNT');
        expect(res1.error?.toLowerCase()).toContain('invalid overflow input');

        // 150,000,000 NGN
        const res2 = validateTransactionAmount(150_000_000, 'NGN');
        expect(res2.valid).toBe(false);
        expect(res2.error?.toLowerCase()).toContain('invalid overflow input');
      });

      it('hard rejects minor unit inputs > 10,000,000,000 Kobo as invalid overflow input', () => {
        const res = validateTransactionAmount(10_000_000_001n, 'NGN');
        expect(res.valid).toBe(false);
        expect(res.error?.toLowerCase()).toContain('invalid overflow input');
      });
    });

    describe('USD Ceilings ($10,000 confirmation, $100,000 hard reject)', () => {
      it('allows normal USD amounts <= $10,000 without confirmation', () => {
        const res = validateTransactionAmount(2500, 'USD');
        expect(res.valid).toBe(true);
        expect(res.requires_confirmation).toBe(false);

        const boundary = validateTransactionAmount(10_000, 'USD');
        expect(boundary.valid).toBe(true);
        expect(boundary.requires_confirmation).toBe(false);
      });

      it('flags USD amounts > $10,000 (1,000,000 Cents) with requires_confirmation = true', () => {
        const res1 = validateTransactionAmount(10_001, 'USD');
        expect(res1.valid).toBe(true);
        expect(res1.requires_confirmation).toBe(true);
        if (res1.valid) {
          expect(res1.amount).toBe(1000100n);
        }

        const res2 = validateTransactionAmount(25_000, 'USD');
        expect(res2.valid).toBe(true);
        expect(res2.requires_confirmation).toBe(true);
        if (res2.valid) {
          expect(res2.amount).toBe(2500000n);
        }
      });

      it('allows USD amounts up to exact $100,000 (10,000,000 Cents) with confirmation', () => {
        const res = validateTransactionAmount(100_000, 'USD');
        expect(res.valid).toBe(true);
        expect(res.requires_confirmation).toBe(true);
        if (res.valid) {
          expect(res.amount).toBe(10000000n);
        }
      });

      it('hard rejects USD amounts > $100,000 (10,000,000 Cents) as invalid overflow input', () => {
        const res1 = validateTransactionAmount(100_001, 'USD');
        expect(res1.valid).toBe(false);
        expect(res1.code).toBe('OVERFLOW_AMOUNT');
        expect(res1.error?.toLowerCase()).toContain('invalid overflow input');

        const res2 = validateTransactionAmount(250_000, 'USD');
        expect(res2.valid).toBe(false);
        expect(res2.error?.toLowerCase()).toContain('invalid overflow input');
      });
    });
  });

  describe('Requirement 4: Pure, Modular Pre-DB Validation & Database Integration', () => {
    it('is a pure function that does not throw unexpectedly and returns deterministic results', () => {
      const out1 = validateTransactionAmount(5000, 'NGN');
      const out2 = validateTransactionAmount(5000, 'NGN');
      expect(out1).toEqual(out2);

      const err1 = validateTransactionAmount(-5000, 'NGN');
      const err2 = validateTransactionAmount(-5000, 'NGN');
      expect(err1).toEqual(err2);
    });

    it('supports alternative aliases: validateTransaction and validateAmount', () => {
      const r1 = validateTransaction({ amount: 5000, currency: 'NGN' });
      const r2 = validateAmount(5000, 'NGN');
      expect(r1.valid).toBe(true);
      expect(r2.valid).toBe(true);
      expect(r1.amount).toBe(500000n);
      expect(r2.amount).toBe(500000n);
    });

    it('assertValidTransactionAmount throws TransactionValidationError when invalid', () => {
      expect(() => assertValidTransactionAmount(-50, 'NGN')).toThrow(TransactionValidationError);
      expect(() => assertValidTransactionAmount(200_000_000, 'NGN')).toThrow(TransactionValidationError);
      expect(() => assertValidTransactionAmount(5000, 'NGN')).not.toThrow();
    });
  });

  describe('Database Integration with recordTransaction() and getBalance()', () => {
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
        whatsappId: '2348099887766',
        name: 'Precision Test User',
        profileType: 'personal',
        currency: 'NGN',
        onboardingComplete: true,
      });
    });

    it('rejects negative amount before database writes in recordTransaction', async () => {
      await expect(
        recordTransaction({
          userId: testUser._id,
          type: 'expense',
          amount: -5000,
          category: 'fuel',
          source: 'text',
        })
      ).rejects.toThrow(/strictly positive/i);

      // Verify nothing was written to DB
      const count = await Transaction.countDocuments({ userId: testUser._id });
      expect(count).toBe(0);
    });

    it('rejects zero amount before database writes in recordTransaction', async () => {
      await expect(
        recordTransaction({
          userId: testUser._id,
          type: 'expense',
          amount: 0,
          category: 'fuel',
          source: 'text',
        })
      ).rejects.toThrow(/strictly positive/i);

      const count = await Transaction.countDocuments({ userId: testUser._id });
      expect(count).toBe(0);
    });

    it('hard rejects overflow amount (> 100M NGN) before database writes in recordTransaction', async () => {
      await expect(
        recordTransaction({
          userId: testUser._id,
          type: 'expense',
          amount: 150_000_000,
          currency: 'NGN',
          category: 'real_estate',
          source: 'text',
        })
      ).rejects.toThrow(/invalid overflow input/i);

      const count = await Transaction.countDocuments({ userId: testUser._id });
      expect(count).toBe(0);
    });

    it('flags high value transactions (> 10M NGN) with requires_confirmation in recordTransaction result', async () => {
      const result = await recordTransaction({
        userId: testUser._id,
        type: 'income',
        amount: 15_000_000,
        currency: 'NGN',
        category: 'sales',
        source: 'text',
      });

      expect(result.transaction).toBeDefined();
      expect(result.requires_confirmation).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
    });

    it('persists amounts strictly as integers without float imprecision in MongoDB', async () => {
      const result = await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 25000,
        currency: 'NGN',
        category: 'groceries',
        source: 'text',
      });

      expect(Number.isInteger(result.transaction.amount)).toBe(true);
      expect(Number.isInteger(result.runningBalance)).toBe(true);

      const dbTx = await Transaction.findById(result.transaction._id);
      expect(dbTx).not.toBeNull();
      expect(Number.isInteger(dbTx?.amount)).toBe(true);
    });

    it('calculates running balances in getBalance as Integer and BigInt', async () => {
      await recordTransaction({
        userId: testUser._id,
        type: 'income',
        amount: 50000,
        currency: 'NGN',
        category: 'salary',
        source: 'text',
      });

      await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 18000,
        currency: 'NGN',
        category: 'utilities',
        source: 'text',
      });

      const balance = await getBalance(testUser._id, 'NGN');
      expect(balance.balance).toBe(32000);
      expect(balance.balanceBigInt).toBe(32000n);
      expect(balance.totalIncome).toBe(50000);
      expect(balance.totalExpenses).toBe(18000);
      expect(Number.isInteger(balance.balance)).toBe(true);
      expect(Number.isInteger(balance.totalIncome)).toBe(true);
      expect(Number.isInteger(balance.totalExpenses)).toBe(true);
    });
  });
});
