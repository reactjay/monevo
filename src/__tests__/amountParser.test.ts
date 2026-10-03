import { parseTransaction } from '../services/ai/amountParser';

describe('Nigerian Numerical Slang and Currency Normalization', () => {
  describe('Required Test Cases', () => {
    it('normalizes "spent 500k on fuel" to 500,000 NGN', () => {
      const result = parseTransaction('spent 500k on fuel');
      expect(result).toEqual({
        amount: 500000,
        currency: 'NGN',
      });
    });

    it('normalizes "paid 2.5m for rent" to 2,500,000 NGN', () => {
      const result = parseTransaction('paid 2.5m for rent');
      expect(result).toEqual({
        amount: 2500000,
        currency: 'NGN',
      });
    });

    it('normalizes "bought data for 2000" to 2,000 NGN', () => {
      const result = parseTransaction('bought data for 2000');
      expect(result).toEqual({
        amount: 2000,
        currency: 'NGN',
      });
    });
  });

  describe('Nigerian Numerical Slang Abbreviations', () => {
    it('handles thousand abbreviations: "k", "thousand"', () => {
      expect(parseTransaction('sent 500k for food')).toEqual({
        amount: 500000,
        currency: 'NGN',
      });
      expect(parseTransaction('spent 500 thousand on groceries')).toEqual({
        amount: 500000,
        currency: 'NGN',
      });
    });

    it('handles million abbreviations: "m", "mils", "million", "bar"', () => {
      expect(parseTransaction('paid 2bar for rent')).toEqual({
        amount: 2000000,
        currency: 'NGN',
      });
      expect(parseTransaction('paid 2 bars for car')).toEqual({
        amount: 2000000,
        currency: 'NGN',
      });
      expect(parseTransaction('paid 1.5mils for laptop')).toEqual({
        amount: 1500000,
        currency: 'NGN',
      });
      expect(parseTransaction('paid 2.5 million for land')).toEqual({
        amount: 2500000,
        currency: 'NGN',
      });
    });
  });

  describe('Currency Context Detection', () => {
    it('defaults to NGN when currency is unspecified', () => {
      const result = parseTransaction('spent 50k on shopping');
      expect(result?.currency).toBe('NGN');
    });

    it('detects NGN context explicitly (₦, NGN, naira)', () => {
      expect(parseTransaction('spent ₦500k on fuel')).toEqual({
        amount: 500000,
        currency: 'NGN',
      });
      expect(parseTransaction('paid NGN 2000 for data')).toEqual({
        amount: 2000,
        currency: 'NGN',
      });
    });

    it('detects USD context explicitly ($, USD, dollar)', () => {
      expect(parseTransaction('spent $500k on fuel')).toEqual({
        amount: 500000,
        currency: 'USD',
      });
      expect(parseTransaction('paid 2.5m USD for software')).toEqual({
        amount: 2500000,
        currency: 'USD',
      });
      expect(parseTransaction('bought data for $2000')).toEqual({
        amount: 2000,
        currency: 'USD',
      });
    });
  });

  describe('Major Units and No Ledger Arithmetic', () => {
    it('returns positive integer representing major units without ledger debit subtraction', () => {
      const result = parseTransaction('spent 500k on fuel');
      expect(result?.amount).toBeGreaterThan(0);
      expect(Number.isInteger(result?.amount)).toBe(true);
      expect(result?.amount).toBe(500000);
    });
  });
});
