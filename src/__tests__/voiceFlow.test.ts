import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import { Transaction } from '../models/Transaction';
import { ConversationState } from '../models/ConversationState';
import { handleAudioMessage, NO_AUDIO_MEDIA_MESSAGE, EMPTY_TRANSCRIPT_MESSAGE, VOICE_PROCESSING_ERROR_MESSAGE } from '../handlers/audioHandler';
import { handleTextMessage } from '../handlers/textHandler';
import * as whatsappClient from '../services/whatsapp/client';
import * as assemblyService from '../services/assemblyai/assemblyai.service';
import { ParsedMessage } from '../types/whatsapp';

let testUser: IUserDocument;
let sendTextMessageSpy: jest.SpyInstance;
let downloadAudioSpy: jest.SpyInstance;
let transcribeAudioSpy: jest.SpyInstance;

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
    whatsappId: '2348012345678',
    name: 'Amina Bello',
    profileType: 'business',
    businessName: 'Bello Logistics',
    currency: 'NGN',
    onboardingComplete: true,
  });

  sendTextMessageSpy = jest
    .spyOn(whatsappClient, 'sendTextMessage')
    .mockImplementation(async () => Promise.resolve());

  downloadAudioSpy = jest
    .spyOn(whatsappClient, 'downloadWhatsAppAudio')
    .mockImplementation(async () => ({
      buffer: Buffer.from('voice-audio-bytes'),
      mimeType: 'audio/ogg; codecs=opus',
    }));

  transcribeAudioSpy = jest
    .spyOn(assemblyService, 'transcribeAudio')
    .mockImplementation(async () => ({
      transcript: 'I spent twelve thousand naira on fuel today.',
      confidence: 0.98,
    }));
});

afterEach(() => {
  sendTextMessageSpy.mockRestore();
  downloadAudioSpy.mockRestore();
  transcribeAudioSpy.mockRestore();
});

describe('Phase 9 — Complete Voice Transaction Flow', () => {
  // ── 1. Full Voice Transaction Flow ─────────────────────────
  describe('Full Voice Transaction Flow', () => {
    it('downloads, transcribes with AssemblyAI, extracts intent, and records expense in MongoDB', async () => {
      transcribeAudioSpy.mockResolvedValueOnce({
        transcript: 'I spent twelve thousand naira on fuel today.',
        confidence: 0.98,
      });

      const audioMsg: ParsedMessage = {
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        messageId: 'wamid.voice.001',
        type: 'audio',
        audioMediaId: 'media-audio-12345',
        timestamp: new Date(),
      };

      const result = await handleAudioMessage(audioMsg);

      expect(result).toBeDefined();
      expect(downloadAudioSpy).toHaveBeenCalledWith('media-audio-12345');
      expect(transcribeAudioSpy).toHaveBeenCalledTimes(1);

      // Verify MongoDB transaction document
      const tx = await Transaction.findOne({ userId: testUser._id });
      expect(tx).not.toBeNull();
      expect(tx?.type).toBe('expense');
      expect(tx?.amount).toBe(12000);
      expect(tx?.currency).toBe('NGN');
      expect(tx?.category).toBe('fuel');
      expect(tx?.source).toBe('voice');
      expect(tx?.transcript).toBe('I spent twelve thousand naira on fuel today.');
      expect(tx?.whatsappMessageId).toBe('wamid.voice.001');

      // Verify formatted WhatsApp reply
      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('✅ Expense recorded');
      expect(sentText).toContain('Amount: ₦12,000');
      expect(sentText).toContain('Category: Fuel');
      expect(sentText).toContain('Date: Today');
      expect(sentText).toContain('Your running balance is -₦12,000.');
    });

    it('processes voice income note with counterparty: "I received one hundred and fifty thousand naira from David for website development"', async () => {
      transcribeAudioSpy.mockResolvedValueOnce({
        transcript: 'I received one hundred and fifty thousand naira from David for website development',
        confidence: 0.99,
      });

      const audioMsg: ParsedMessage = {
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        messageId: 'wamid.voice.002',
        type: 'audio',
        audioMediaId: 'media-audio-54321',
        timestamp: new Date(),
      };

      await handleAudioMessage(audioMsg);

      const tx = await Transaction.findOne({ userId: testUser._id });
      expect(tx).not.toBeNull();
      expect(tx?.type).toBe('income');
      expect(tx?.amount).toBe(150000);
      expect(tx?.counterparty).toBe('David');
      expect(tx?.source).toBe('voice');
      expect(tx?.transcript).toBe(
        'I received one hundred and fifty thousand naira from David for website development'
      );

      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('✅ Income recorded');
      expect(sentText).toContain('Amount: ₦150,000');
      expect(sentText).toContain('From: David');
      expect(sentText).toContain('Your running balance is ₦150,000.');
    });
  });

  // ── 2. Voice Financial Queries ─────────────────────────────
  describe('Voice Financial Queries', () => {
    it('executes MongoDB aggregation and formats response for voice query "How much did I spend this week?"', async () => {
      // Seed an existing expense
      await Transaction.create({
        userId: testUser._id,
        type: 'expense',
        amount: 45000,
        currency: 'NGN',
        category: 'inventory',
        description: 'Store goods',
        source: 'text',
        date: new Date(),
      });

      transcribeAudioSpy.mockResolvedValueOnce({
        transcript: 'How much did I spend this week?',
        confidence: 0.96,
      });

      const audioMsg: ParsedMessage = {
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        messageId: 'wamid.voice.003',
        type: 'audio',
        audioMediaId: 'media-audio-query',
        timestamp: new Date(),
      };

      await handleAudioMessage(audioMsg);

      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('📊 *This Week*');
      expect(sentText).toContain('Expenses: ₦45,000');
      expect(sentText).toContain('Inventory: ₦45,000');
      expect(sentText).toContain('Transactions: 1');
    });
  });

  // ── 3. Multi-Turn Clarification Flow ────────────────────────
  describe('Multi-Turn Clarification Flow via Voice & Text', () => {
    it('completes two-turn voice clarification flow: "I spent money on fuel" -> "Eight thousand"', async () => {
      // Turn 1: Voice message missing amount
      transcribeAudioSpy.mockResolvedValueOnce({
        transcript: 'I spent money on fuel',
        confidence: 0.97,
      });

      const turn1Msg: ParsedMessage = {
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        messageId: 'wamid.voice.clarify.001',
        type: 'audio',
        audioMediaId: 'media-audio-clarify-1',
        timestamp: new Date(),
      };

      await handleAudioMessage(turn1Msg);

      // Verify clarification request sent
      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      expect(sendTextMessageSpy.mock.calls[0][1]).toBe('How much did you spend on fuel?');

      // Verify ConversationState saved with pending clarification
      const stateDoc = await ConversationState.findOne({ whatsappId: testUser.whatsappId });
      expect(stateDoc).not.toBeNull();
      expect(stateDoc?.state).toBe('AWAITING_CLARIFICATION');
      const ctx = stateDoc?.context as unknown as { partial?: { category?: string } };
      expect(ctx?.partial?.category).toBe('fuel');

      sendTextMessageSpy.mockClear();

      // Turn 2: Voice response with amount "Eight thousand"
      transcribeAudioSpy.mockResolvedValueOnce({
        transcript: 'Eight thousand.',
        confidence: 0.96,
      });

      const turn2Msg: ParsedMessage = {
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        messageId: 'wamid.voice.clarify.002',
        type: 'audio',
        audioMediaId: 'media-audio-clarify-2',
        timestamp: new Date(),
      };

      await handleAudioMessage(turn2Msg);

      // Verify transaction is recorded with merged category & extracted amount
      const tx = await Transaction.findOne({ userId: testUser._id });
      expect(tx).not.toBeNull();
      expect(tx?.type).toBe('expense');
      expect(tx?.amount).toBe(8000);
      expect(tx?.category).toBe('fuel');
      expect(tx?.source).toBe('voice');

      // Verify conversational response
      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain("Got it. I've recorded ₦8,000 for Fuel today.");
      expect(sentText).toContain('Your running balance is -₦8,000.');

      // Verify ConversationState cleared
      const updatedState = await ConversationState.findOne({ whatsappId: testUser.whatsappId });
      expect(updatedState?.state).toBe('COMPLETED');
    });

    it('completes voice clarification answered via text: voice "Spent money on food" -> text "15k"', async () => {
      // Turn 1: Voice message
      transcribeAudioSpy.mockResolvedValueOnce({
        transcript: 'Spent money on food',
        confidence: 0.95,
      });

      await handleAudioMessage({
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        messageId: 'wamid.voice.food.001',
        type: 'audio',
        audioMediaId: 'media-audio-food',
        timestamp: new Date(),
      });

      expect(sendTextMessageSpy).toHaveBeenCalledWith(
        testUser.whatsappId,
        'How much did you spend on food?'
      );

      sendTextMessageSpy.mockClear();

      // Turn 2: Text response "15k"
      await handleTextMessage({
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        messageId: 'wamid.text.food.002',
        type: 'text',
        text: '15k',
        timestamp: new Date(),
      });

      const tx = await Transaction.findOne({ userId: testUser._id });
      expect(tx).not.toBeNull();
      expect(tx?.amount).toBe(15000);
      expect(tx?.category).toBe('food');

      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      expect(sendTextMessageSpy.mock.calls[0][1]).toContain(
        "Got it. I've recorded ₦15,000 for Food today."
      );
    });

    it('cancels pending clarification when user says "cancel"', async () => {
      // Set active clarification state
      await ConversationState.create({
        whatsappId: testUser.whatsappId,
        state: 'AWAITING_CLARIFICATION',
        context: {
          pendingClarification: true,
          partial: { type: 'expense', category: 'fuel' },
          missing: ['amount'],
        },
      });

      await handleTextMessage({
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        messageId: 'wamid.cancel.001',
        type: 'text',
        text: 'cancel',
        timestamp: new Date(),
      });

      expect(sendTextMessageSpy).toHaveBeenCalledWith(
        testUser.whatsappId,
        'Transaction cancelled. You can record a new transaction anytime!'
      );

      const count = await Transaction.countDocuments({ userId: testUser._id });
      expect(count).toBe(0);

      const stateDoc = await ConversationState.findOne({ whatsappId: testUser.whatsappId });
      expect(stateDoc?.state).toBe('COMPLETED');
    });
  });

  // ── 4. Error Handling & Edge Cases ──────────────────────────
  describe('Error Handling & Edge Cases', () => {
    it('handles AssemblyAI transcription error gracefully with friendly error message', async () => {
      transcribeAudioSpy.mockRejectedValueOnce(
        new Error('AssemblyAI rate limit or API error')
      );

      const audioMsg: ParsedMessage = {
        senderId: testUser.whatsappId,
        messageId: 'wamid.err.001',
        type: 'audio',
        audioMediaId: 'media-err-1',
        timestamp: new Date(),
      };

      await handleAudioMessage(audioMsg);

      expect(sendTextMessageSpy).toHaveBeenCalledWith(
        testUser.whatsappId,
        VOICE_PROCESSING_ERROR_MESSAGE
      );
    });

    it('handles missing audio media ID gracefully', async () => {
      const audioMsg: ParsedMessage = {
        senderId: testUser.whatsappId,
        messageId: 'wamid.no_media.001',
        type: 'audio',
        timestamp: new Date(),
      };

      await handleAudioMessage(audioMsg);

      expect(sendTextMessageSpy).toHaveBeenCalledWith(
        testUser.whatsappId,
        NO_AUDIO_MEDIA_MESSAGE
      );
    });

    it('handles silent voice note (empty transcript) gracefully', async () => {
      transcribeAudioSpy.mockResolvedValueOnce({
        transcript: '',
      });

      const audioMsg: ParsedMessage = {
        senderId: testUser.whatsappId,
        messageId: 'wamid.silent.001',
        type: 'audio',
        audioMediaId: 'media-silent-1',
        timestamp: new Date(),
      };

      await handleAudioMessage(audioMsg);

      expect(sendTextMessageSpy).toHaveBeenCalledWith(
        testUser.whatsappId,
        EMPTY_TRANSCRIPT_MESSAGE
      );
    });
  });
});
