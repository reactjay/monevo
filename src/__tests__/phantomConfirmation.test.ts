import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import { Transaction, ITransactionDocument } from '../models/Transaction';
import { recordTransaction, safeRecordTransaction } from '../services/tools/recordTransaction';
import { getBalance } from '../services/tools/getBalance';
import { formatTransactionConfirmation } from '../services/tools/formatters';
import { dispatchIntent } from '../services/tools/toolDispatcher';
import { handleTextMessage } from '../handlers/textHandler';
import { handleAudioMessage } from '../handlers/audioHandler';
import * as whatsappClient from '../services/whatsapp/client';
import * as groqService from '../services/ai/groqService';
import * as assemblyService from '../services/assemblyai/assemblyai.service';
import * as intentExtractor from '../services/ai/intentExtractor';
import { ParsedMessage } from '../types/whatsapp';
import { FinancialIntent } from '../services/ai/schemas';

describe('Phantom Transaction Confirmation Prevention & Verified Persistence (Issue #17 / Finding #1)', () => {
  let testUser: IUserDocument;
  let sendTextMessageSpy: jest.SpyInstance;

  beforeAll(async () => {
    await connectTestDb();
  }, 60000);

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    jest.clearAllMocks();

    testUser = await User.create({
      whatsappId: '2348011223344',
      name: 'Ada Lovelace',
      profileType: 'personal',
      currency: 'NGN',
      onboardingComplete: true,
    });

    sendTextMessageSpy = jest
      .spyOn(whatsappClient, 'sendTextMessage')
      .mockImplementation(async () => Promise.resolve());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Requirement 1 & 2: Persistence-First Guarantee and Read-Back Verification', () => {
    it('successfully persists transaction, verifies document ID, and reads back true balance', async () => {
      // 1. Record an income of 50,000 NGN
      const result = await recordTransaction({
        userId: testUser._id,
        type: 'income',
        amount: 50000,
        currency: 'NGN',
        category: 'salary',
        description: 'Monthly salary',
        source: 'text',
      });

      // Verification checks
      expect(result.isVerified).toBe(true);
      expect(result.verifiedId).toBeDefined();
      expect(typeof result.verifiedId).toBe('string');
      expect(result.verifiedId.length).toBeGreaterThan(0);
      expect(result.runningBalance).toBe(50000);
      expect(result.formattedResponse).toContain('✅ Income recorded');
      expect(result.formattedResponse).toContain('Amount: ₦50,000');
      expect(result.formattedResponse).toContain('Your running balance is ₦50,000');

      // Immediate Read-Back verification in database
      const dbTx = await Transaction.findById(result.verifiedId);
      expect(dbTx).not.toBeNull();
      expect(dbTx!._id.toString()).toBe(result.verifiedId);
      expect(dbTx!.category).toBe('salary');
      expect(dbTx!.amount).toBe(50000);
    });

    it('updates running balance accurately across successive verified writes', async () => {
      // Step 1: Initial deposit 100,000 NGN
      const incomeResult = await recordTransaction({
        userId: testUser._id,
        type: 'income',
        amount: 100000,
        currency: 'NGN',
        category: 'sales',
        source: 'text',
      });
      expect(incomeResult.isVerified).toBe(true);
      expect(incomeResult.runningBalance).toBe(100000);

      // Step 2: Expense of 35,000 NGN
      const expenseResult = await recordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 35000,
        currency: 'NGN',
        category: 'supplies',
        source: 'text',
      });
      expect(expenseResult.isVerified).toBe(true);
      expect(expenseResult.runningBalance).toBe(65000);

      // Check DB read-back for both
      const tx1 = await Transaction.findById(incomeResult.verifiedId);
      const tx2 = await Transaction.findById(expenseResult.verifiedId);
      expect(tx1).not.toBeNull();
      expect(tx2).not.toBeNull();

      // Verify balance in DB matches
      const currentBalance = await getBalance(testUser._id, 'NGN');
      expect(currentBalance.balance).toBe(65000);
    });

    it('throws persistence verification error if read-back findById returns null', async () => {
      // Mock findById to simulate uncommitted write or read-back failure
      jest.spyOn(Transaction, 'findById').mockResolvedValueOnce(null);

      await expect(
        recordTransaction({
          userId: testUser._id,
          type: 'expense',
          amount: 5000,
          currency: 'NGN',
          category: 'groceries',
          source: 'text',
        })
      ).rejects.toThrow(/Persistence verification failed.*not found in database after write/i);
    });

    it('formatTransactionConfirmation throws error if document ID is missing (Persistence-First Guarantee)', () => {
      const unpersistedTx = {
        type: 'expense',
        amount: 5000,
        currency: 'NGN',
        category: 'fuel',
        date: new Date(),
      } as unknown as ITransactionDocument;

      expect(() => {
        formatTransactionConfirmation(unpersistedTx, 0);
      }).toThrow(/Persistence-First Guarantee violated.*verified document ID/i);
    });
  });

  describe('Requirement 3: Explicit Failure Messaging & Balance Unaltered Guarantee', () => {
    it('returns explicit failure message and leaves balance unaltered when DB write rejects', async () => {
      // Initial state: establish an existing verified balance of 40,000 NGN
      await recordTransaction({
        userId: testUser._id,
        type: 'income',
        amount: 40000,
        currency: 'NGN',
        category: 'consulting',
        source: 'text',
      });

      const initialBalance = await getBalance(testUser._id, 'NGN');
      expect(initialBalance.balance).toBe(40000);
      const initialCount = await Transaction.countDocuments({ userId: testUser._id });
      expect(initialCount).toBe(1);

      // Mock database write failure
      jest.spyOn(Transaction, 'create').mockRejectedValueOnce(new Error('MongoServerError: connection timed out'));

      // Execute safeRecordTransaction
      const failResult = await safeRecordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 15000,
        currency: 'NGN',
        category: 'electronics',
        source: 'text',
      });

      // Verify explicit failure outcome
      expect(failResult.success).toBe(false);
      expect(failResult.isVerified).toBe(false);
      expect(failResult.verifiedId).toBeUndefined();
      expect(failResult.balanceUnaltered).toBe(true);
      expect(failResult.failureMessage).toBeDefined();
      expect(failResult.failureMessage).toContain('❌ *Transaction Failed*');
      expect(failResult.failureMessage).toContain('Your balance remains unaltered.');
      expect(failResult.failureMessage).not.toContain('✅ Expense recorded');

      // Guarantee balance remains unaltered
      const afterBalance = await getBalance(testUser._id, 'NGN');
      expect(afterBalance.balance).toBe(40000);
      expect(afterBalance.balance).toBe(initialBalance.balance);

      // Guarantee no orphaned transaction was persisted
      const afterCount = await Transaction.countDocuments({ userId: testUser._id });
      expect(afterCount).toBe(initialCount);
    });

    it('returns explicit failure message when validation fails (negative amount)', async () => {
      const failResult = await safeRecordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: -5000,
        currency: 'NGN',
        category: 'fuel',
        source: 'text',
      });

      expect(failResult.success).toBe(false);
      expect(failResult.isVerified).toBe(false);
      expect(failResult.failureMessage).toContain('❌ *Transaction Failed*');
      expect(failResult.failureMessage).toContain('strictly positive');
      expect(failResult.balanceUnaltered).toBe(true);
    });

    it('returns explicit failure message when overflow ceiling is exceeded (> 100M NGN)', async () => {
      const failResult = await safeRecordTransaction({
        userId: testUser._id,
        type: 'expense',
        amount: 120_000_000,
        currency: 'NGN',
        category: 'jet',
        source: 'text',
      });

      expect(failResult.success).toBe(false);
      expect(failResult.isVerified).toBe(false);
      expect(failResult.failureMessage).toContain('❌ *Transaction Failed*');
      expect(failResult.failureMessage).toContain('invalid overflow input');
      expect(failResult.balanceUnaltered).toBe(true);
    });
  });

  describe('Phantom Confirmation Prevention in Tool Dispatcher & Handlers', () => {
    it('dispatchIntent returns failure message and zero success markers on DB write rejection', async () => {
      jest.spyOn(Transaction, 'create').mockRejectedValueOnce(new Error('Database write rejected: disk full'));

      const intent: FinancialIntent = {
        intent: 'record_transaction',
        transaction: {
          type: 'expense',
          amount: 8000,
          currency: 'NGN',
          category: 'repairs',
          description: 'Car maintenance',
          counterparty: null,
          date: '2026-10-03',
        },
      };

      const response = await dispatchIntent(intent, {
        user: testUser,
        source: 'text',
      });

      expect(response).toContain('❌ *Transaction Failed*');
      expect(response).toContain('Database write rejected: disk full');
      expect(response).toContain('Your balance remains unaltered.');
      // ABSOLUTELY NO PHANTOM CONFIRMATION
      expect(response).not.toContain('✅');
      expect(response).not.toContain('Expense recorded');
      expect(response).not.toContain('Income recorded');
    });

    it('dispatchIntent returns confirmation prompt for high-value transactions (> 10M NGN) without writing to DB', async () => {
      const countBefore = await Transaction.countDocuments({ userId: testUser._id });

      const intent: FinancialIntent = {
        intent: 'record_transaction',
        transaction: {
          type: 'income',
          amount: 25_000_000,
          currency: 'NGN',
          category: 'property_sale',
          description: 'Land sale proceeds',
          counterparty: 'Acme Properties',
          date: '2026-10-03',
        },
      };

      const response = await dispatchIntent(intent, {
        user: testUser,
        source: 'text',
      });

      expect(response).toContain('⚠️ *Transaction Confirmation Required*');
      expect(response).toContain('exceeds the high-value confirmation threshold');
      expect(response).toContain('Please confirm to proceed');
      // No success message
      expect(response).not.toContain('✅');
      expect(response).not.toContain('Income recorded');

      // Verify no write occurred before confirmation
      const countAfter = await Transaction.countDocuments({ userId: testUser._id });
      expect(countAfter).toBe(countBefore);
    });

    it('dispatchIntent persists transaction when confirmed is true for high-value transactions', async () => {
      const intent: FinancialIntent = {
        intent: 'record_transaction',
        transaction: {
          type: 'income',
          amount: 25_000_000,
          currency: 'NGN',
          category: 'property_sale',
          description: 'Land sale proceeds',
          counterparty: 'Acme Properties',
          date: '2026-10-03',
          confirmed: true,
        },
      };

      const response = await dispatchIntent(intent, {
        user: testUser,
        source: 'text',
      });

      expect(response).toContain('✅ Income recorded');
      expect(response).toContain('Amount: ₦25,000,000');

      const count = await Transaction.countDocuments({ userId: testUser._id });
      expect(count).toBe(1);
    });

    it('handleTextMessage: mocks write failure and verifies no success confirmation is emitted to WhatsApp', async () => {
      // Mock intent extraction to return a valid record_transaction intent
      jest.spyOn(intentExtractor, 'extractIntent').mockResolvedValueOnce({
        intent: 'record_transaction',
        transaction: {
          type: 'expense',
          amount: 12000,
          currency: 'NGN',
          category: 'fuel',
          description: 'Fuel for generator',
          counterparty: null,
          date: '2026-10-03',
        },
      });

      // Mock database write failure
      jest.spyOn(Transaction, 'create').mockRejectedValueOnce(new Error('WriteConflict: document locked'));

      const incomingMessage: ParsedMessage = {
        messageId: 'msg-err-101',
        senderId: testUser.whatsappId,
        senderName: 'Ada Lovelace',
        text: 'Spent 12000 on fuel today',
        timestamp: new Date(),
        type: 'text',
      };

      await handleTextMessage(incomingMessage);

      // Verify WhatsApp client was called
      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];

      // Must be an explicit failure message
      expect(sentText).toContain('❌ *Transaction Failed*');
      expect(sentText).toContain('WriteConflict: document locked');
      expect(sentText).toContain('Your balance remains unaltered.');

      // ZERO PHANTOM CONFIRMATION
      expect(sentText).not.toContain('✅');
      expect(sentText).not.toContain('Expense recorded');
      expect(sentText).not.toContain('Income recorded');
    });

    it('handleAudioMessage: mocks write failure on voice note and verifies no success confirmation is emitted', async () => {
      // Mock audio download
      jest.spyOn(whatsappClient, 'downloadWhatsAppAudio').mockResolvedValueOnce({
        buffer: Buffer.from('fake-audio-data'),
        mimeType: 'audio/ogg; codecs=opus',
      });

      // Mock transcription
      jest.spyOn(groqService, 'transcribeAudioWithGroq').mockResolvedValueOnce({
        transcript: 'Spent 20000 on generator repairs',
      });
      jest.spyOn(assemblyService, 'transcribeAudio').mockResolvedValueOnce({
        transcript: 'Spent 20000 on generator repairs',
      });

      // Mock intent extraction
      jest.spyOn(intentExtractor, 'extractIntent').mockResolvedValueOnce({
        intent: 'record_transaction',
        transaction: {
          type: 'expense',
          amount: 20000,
          currency: 'NGN',
          category: 'repairs',
          description: 'Generator repairs',
          counterparty: null,
          date: '2026-10-03',
        },
      });

      // Mock database write failure
      jest.spyOn(Transaction, 'create').mockRejectedValueOnce(new Error('MongoNetworkError: connection reset by peer'));

      const incomingAudioMessage: ParsedMessage = {
        messageId: 'voice-err-202',
        senderId: testUser.whatsappId,
        senderName: 'Ada Lovelace',
        audioMediaId: 'media-audio-123',
        timestamp: new Date(),
        type: 'audio',
      };

      await handleAudioMessage(incomingAudioMessage);

      expect(sendTextMessageSpy).toHaveBeenCalled();
      const sentText = sendTextMessageSpy.mock.calls[0][1];

      expect(sentText).toContain('❌ *Transaction Failed*');
      expect(sentText).toContain('MongoNetworkError: connection reset by peer');
      expect(sentText).toContain('Your balance remains unaltered.');
      expect(sentText).not.toContain('✅');
      expect(sentText).not.toContain('Expense recorded');
    });

    it('generateInteractiveResponseWithGroq intercepts and suppresses LLM hallucinated success when tool result is failure', async () => {
      const failureToolResult = '❌ *Transaction Failed*\n\nMongoNetworkError: connection timed out\n\nYour balance remains unaltered.';

      // Attempt to invoke Groq interactive response with failure tool result
      const finalResponse = await groqService.generateInteractiveResponseWithGroq({
        userName: 'Ada',
        userMessage: 'Spent 5000 on lunch',
        toolResultText: failureToolResult,
      });

      // The LLM must NOT rewrite the failure message
      expect(finalResponse).toContain('❌ *Transaction Failed*');
      expect(finalResponse).toContain('Your balance remains unaltered.');
      expect(finalResponse).not.toContain('✅');
      expect(finalResponse).not.toContain('Expense recorded');
    });

    it('isFailureOrConfirmationPrompt correctly detects all error and confirmation patterns', () => {
      expect(groqService.isFailureOrConfirmationPrompt('❌ *Transaction Failed*')).toBe(true);
      expect(groqService.isFailureOrConfirmationPrompt('⚠️ *Transaction Confirmation Required*')).toBe(true);
      expect(groqService.isFailureOrConfirmationPrompt('Error: amounts must be strictly positive')).toBe(true);
      expect(groqService.isFailureOrConfirmationPrompt('invalid overflow input')).toBe(true);
      expect(groqService.isFailureOrConfirmationPrompt('Your balance remains unaltered.')).toBe(true);
      expect(groqService.isFailureOrConfirmationPrompt('Persistence verification failed')).toBe(true);
      expect(groqService.isFailureOrConfirmationPrompt('Persistence-First Guarantee violated')).toBe(true);

      // Normal success result must NOT be flagged as failure
      expect(groqService.isFailureOrConfirmationPrompt('✅ Expense recorded\nAmount: ₦5,000')).toBe(false);
      expect(groqService.isFailureOrConfirmationPrompt('Your balance is ₦50,000')).toBe(false);
    });
  });
});
