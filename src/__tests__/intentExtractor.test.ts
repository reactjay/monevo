import { extractIntent } from '../services/ai/intentExtractor';
import { FinancialIntentSchema } from '../services/ai/schemas';

describe('Phase 7 — AI Financial Intent Extraction', () => {
  const refDate = new Date('2026-09-10T12:00:00Z');
  const todayStr = '2026-09-10';
  const yesterdayStr = '2026-09-09';

  const defaultOpts = {
    defaultCurrency: 'NGN',
    timezone: 'Africa/Lagos',
    referenceDate: refDate,
  };

  // ── 1. Record Transaction Tests ──────────────────────────────
  describe('Record transaction intents', () => {
    it('extracts "I spent ₦12,000 on fuel."', async () => {
      const result = await extractIntent('I spent ₦12,000 on fuel.', defaultOpts);

      // Verify validation passes schema
      expect(() => FinancialIntentSchema.parse(result)).not.toThrow();

      expect(result.intent).toBe('record_transaction');
      if (result.intent === 'record_transaction') {
        expect(result.transaction.type).toBe('expense');
        expect(result.transaction.amount).toBe(12000);
        expect(result.transaction.currency).toBe('NGN');
        expect(result.transaction.category).toBe('fuel');
        expect(result.transaction.counterparty).toBeNull();
        expect(result.transaction.date).toBe(todayStr);
      }
    });

    it('extracts "I received ₦150,000 from David."', async () => {
      const result = await extractIntent('I received ₦150,000 from David.', defaultOpts);

      expect(result.intent).toBe('record_transaction');
      if (result.intent === 'record_transaction') {
        expect(result.transaction.type).toBe('income');
        expect(result.transaction.amount).toBe(150000);
        expect(result.transaction.currency).toBe('NGN');
        expect(result.transaction.counterparty).toBe('David');
        expect(result.transaction.date).toBe(todayStr);
      }
    });

    it('extracts "David paid me 150k for website development."', async () => {
      const result = await extractIntent(
        'David paid me 150k for website development.',
        defaultOpts
      );

      expect(result.intent).toBe('record_transaction');
      if (result.intent === 'record_transaction') {
        expect(result.transaction.type).toBe('income');
        expect(result.transaction.amount).toBe(150000);
        expect(result.transaction.currency).toBe('NGN');
        expect(result.transaction.category).toBe('freelance');
        expect(result.transaction.description).toBe('Website development');
        expect(result.transaction.counterparty).toBe('David');
        expect(result.transaction.date).toBe(todayStr);
      }
    });

    it('extracts "I spent 5k on food yesterday."', async () => {
      const result = await extractIntent('I spent 5k on food yesterday.', defaultOpts);

      expect(result.intent).toBe('record_transaction');
      if (result.intent === 'record_transaction') {
        expect(result.transaction.type).toBe('expense');
        expect(result.transaction.amount).toBe(5000);
        expect(result.transaction.category).toBe('food');
        expect(result.transaction.date).toBe(yesterdayStr);
      }
    });

    it('extracts voice transcript with spoken number words: "I received one hundred and fifty thousand naira from David for website development"', async () => {
      const result = await extractIntent(
        'I received one hundred and fifty thousand naira from David for website development',
        defaultOpts
      );

      expect(result.intent).toBe('record_transaction');
      if (result.intent === 'record_transaction') {
        expect(result.transaction.type).toBe('income');
        expect(result.transaction.amount).toBe(150000);
        expect(result.transaction.currency).toBe('NGN');
        expect(result.transaction.category).toBe('freelance');
        expect(result.transaction.counterparty).toBe('David');
        expect(result.transaction.description).toBe('Website development');
      }
    });

    it('extracts multi-currency transactions ($ / USD and £ / GBP)', async () => {
      const usdResult = await extractIntent('I spent $50 on dinner', defaultOpts);
      if (usdResult.intent === 'record_transaction') {
        expect(usdResult.transaction.amount).toBe(50);
        expect(usdResult.transaction.currency).toBe('USD');
        expect(usdResult.transaction.category).toBe('food');
      }

      const gbpResult = await extractIntent('I spent £30 on uber', defaultOpts);
      if (gbpResult.intent === 'record_transaction') {
        expect(gbpResult.transaction.amount).toBe(30);
        expect(gbpResult.transaction.currency).toBe('GBP');
        expect(gbpResult.transaction.category).toBe('transport');
      }
    });
  });

  // ── 2. Safety Rule: Missing Amount Tests ─────────────────────
  describe('Safety rules and clarification required', () => {
    it('returns clarification_required when amount is missing from "I spent money."', async () => {
      const result = await extractIntent('I spent money.', defaultOpts);

      expect(result.intent).toBe('clarification_required');
      if (result.intent === 'clarification_required') {
        expect(result.missing).toContain('amount');
        expect(result.partial?.type).toBe('expense');
      }
    });

    it('returns clarification_required for "I spent money on fuel"', async () => {
      const result = await extractIntent('I spent money on fuel', defaultOpts);

      expect(result.intent).toBe('clarification_required');
      if (result.intent === 'clarification_required') {
        expect(result.missing).toContain('amount');
        expect(result.partial?.category).toBe('fuel');
      }
    });
  });

  // ── 3. Financial Query Tests ─────────────────────────────────
  describe('Financial queries', () => {
    it('extracts "How much did I spend this week?"', async () => {
      const result = await extractIntent('How much did I spend this week?', defaultOpts);

      expect(result.intent).toBe('financial_query');
      if (result.intent === 'financial_query') {
        expect(result.queryType).toBe('period_summary');
        expect(result.period).toBe('this_week');
      }
    });

    it('extracts "What was my biggest expense?"', async () => {
      const result = await extractIntent('What was my biggest expense?', defaultOpts);

      expect(result.intent).toBe('financial_query');
      if (result.intent === 'financial_query') {
        expect(result.queryType).toBe('largest_expense');
      }
    });

    it('extracts "What did I spend the most on?"', async () => {
      const result = await extractIntent('What did I spend the most on?', defaultOpts);

      expect(result.intent).toBe('financial_query');
      if (result.intent === 'financial_query') {
        expect(result.queryType).toBe('category_summary');
      }
    });

    it('extracts "Show my transport expenses."', async () => {
      const result = await extractIntent('Show my transport expenses.', defaultOpts);

      expect(result.intent).toBe('financial_query');
      if (result.intent === 'financial_query') {
        expect(result.queryType).toBe('category_summary');
        expect(result.category).toBe('transport');
      }
    });

    it('extracts "What is my balance?"', async () => {
      const result = await extractIntent('What is my balance?', defaultOpts);

      expect(result.intent).toBe('financial_query');
      if (result.intent === 'financial_query') {
        expect(result.queryType).toBe('balance');
      }
    });

    it('extracts spending analytics and weekly analytics keywords accurately', async () => {
      const queries = [
        'Weekly summary',
        'Spending analysis',
        'spending analytics',
        'spending summary',
        'weekly analysis',
        'analytics',
        'weekly analytics',
        'weekly anlytics',
        'show analytics',
      ];
      for (const q of queries) {
        const result = await extractIntent(q, defaultOpts);
        expect(result.intent).toBe('financial_query');
        if (result.intent === 'financial_query') {
          expect(result.queryType).toBe('weekly_report');
        }
      }
    });

    it('extracts Nigerian English & Pidgin balance queries', async () => {
      const pidginBalanceQueries = [
        'how much de my account?',
        'how much de my account',
        'how much dey my account',
        'my balance',
        'balance',
        'wetin remain',
        'how much I hold',
        'how much dey inside',
        'check my balance',
      ];
      for (const q of pidginBalanceQueries) {
        const result = await extractIntent(q, defaultOpts);
        expect(result.intent).toBe('financial_query');
        if (result.intent === 'financial_query') {
          expect(result.queryType).toBe('balance');
        }
      }
    });

    it('extracts Nigerian English & Pidgin category & expense queries', async () => {
      const whereMoneyGo = await extractIntent('where my money go', defaultOpts);
      expect(whereMoneyGo.intent).toBe('financial_query');
      if (whereMoneyGo.intent === 'financial_query') {
        expect(whereMoneyGo.queryType).toBe('category_summary');
      }

      const wetinSpendPass = await extractIntent('wetin I spend pass', defaultOpts);
      expect(wetinSpendPass.intent).toBe('financial_query');
      if (wetinSpendPass.intent === 'financial_query') {
        expect(wetinSpendPass.queryType).toBe('category_summary');
      }
    });
  });

  // ── 3b. Nigerian Expressions Transaction Tests ───────────────
  describe('Nigerian Expressions and Pidgin transactions', () => {
    it('extracts "I chop 3k for lunch"', async () => {
      const result = await extractIntent('I chop 3k for lunch', defaultOpts);
      expect(result.intent).toBe('record_transaction');
      if (result.intent === 'record_transaction') {
        expect(result.transaction.type).toBe('expense');
        expect(result.transaction.amount).toBe(3000);
        expect(result.transaction.category).toBe('food');
      }
    });

    it('extracts "comot 2k for transport"', async () => {
      const result = await extractIntent('comot 2k for transport', defaultOpts);
      expect(result.intent).toBe('record_transaction');
      if (result.intent === 'record_transaction') {
        expect(result.transaction.type).toBe('expense');
        expect(result.transaction.amount).toBe(2000);
        expect(result.transaction.category).toBe('transport');
      }
    });

    it('extracts "client pay me 50k"', async () => {
      const result = await extractIntent('client pay me 50k', defaultOpts);
      expect(result.intent).toBe('record_transaction');
      if (result.intent === 'record_transaction') {
        expect(result.transaction.type).toBe('income');
        expect(result.transaction.amount).toBe(50000);
      }
    });

    it('extracts "pay for light bill 15k"', async () => {
      const result = await extractIntent('pay for light bill 15k', defaultOpts);
      expect(result.intent).toBe('record_transaction');
      if (result.intent === 'record_transaction') {
        expect(result.transaction.type).toBe('expense');
        expect(result.transaction.amount).toBe(15000);
        expect(result.transaction.category).toBe('utilities');
      }
    });
  });

  // ── 4. Generate Receipt Tests ────────────────────────────────
  describe('Generate receipt intent', () => {
    it('extracts "Create a receipt for the payment from David."', async () => {
      const result = await extractIntent(
        'Create a receipt for the payment from David.',
        defaultOpts
      );

      expect(result.intent).toBe('generate_receipt');
      if (result.intent === 'generate_receipt') {
        expect(result.target.counterparty).toBe('David');
      }
    });

    it('extracts "Generate a receipt for 50000 from Sarah"', async () => {
      const result = await extractIntent(
        'Generate a receipt for 50000 from Sarah',
        defaultOpts
      );

      expect(result.intent).toBe('generate_receipt');
      if (result.intent === 'generate_receipt') {
        expect(result.target.counterparty).toBe('Sarah');
        expect(result.target.amount).toBe(50000);
      }
    });
  });

  // ── 5. Help & Unknown Intents ────────────────────────────────
  describe('Help and unknown intents', () => {
    it('extracts "Help."', async () => {
      const result = await extractIntent('Help.', defaultOpts);
      expect(result.intent).toBe('help');
    });

    it('extracts "Hello."', async () => {
      const result = await extractIntent('Hello.', defaultOpts);
      expect(result.intent).toBe('unknown');
    });
  });
});
