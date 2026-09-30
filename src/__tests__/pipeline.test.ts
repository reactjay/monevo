import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import { Transaction } from '../models/Transaction';
import { handleTextMessage } from '../handlers/textHandler';
import { handleAudioMessage } from '../handlers/audioHandler';
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
    whatsappId: '2348099887766',
    name: 'Chidi Mokeme',
    profileType: 'business',
    businessName: 'Mokeme Tech',
    currency: 'NGN',
    onboardingComplete: true,
  });

  sendTextMessageSpy = jest
    .spyOn(whatsappClient, 'sendTextMessage')
    .mockImplementation(async () => Promise.resolve());

  downloadAudioSpy = jest
    .spyOn(whatsappClient, 'downloadWhatsAppAudio')
    .mockImplementation(async () => ({
      buffer: Buffer.from('fake-audio-bytes'),
      mimeType: 'audio/ogg; codecs=opus',
    }));

  transcribeAudioSpy = jest
    .spyOn(assemblyService, 'transcribeAudio')
    .mockImplementation(async () => ({
      transcript: 'I received 150000 naira from David for website development',
      confidence: 0.98,
    }));
});

afterEach(() => {
  sendTextMessageSpy.mockRestore();
  downloadAudioSpy.mockRestore();
  transcribeAudioSpy.mockRestore();
});

describe('End-to-End Pipeline Tests', () => {
  describe('Text Flow: Text → AI Intent → Tool → MongoDB → WhatsApp Response', () => {
    it('processes "I spent ₦12,000 on fuel." and records expense', async () => {
      const message: ParsedMessage = {
        messageId: 'wamid.test.001',
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        timestamp: new Date(),
        type: 'text',
        text: 'I spent ₦12,000 on fuel.',
      };

      await handleTextMessage(message);

      // Verify MongoDB transaction
      const tx = await Transaction.findOne({ userId: testUser._id });
      expect(tx).not.toBeNull();
      expect(tx?.type).toBe('expense');
      expect(tx?.amount).toBe(12000);
      expect(tx?.category).toBe('fuel');
      expect(tx?.source).toBe('text');
      expect(tx?.whatsappMessageId).toBe('wamid.test.001');

      // Verify WhatsApp response
      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('✅ Expense recorded');
      expect(sentText).toContain('Amount: ₦12,000');
      expect(sentText).toContain('Category: Fuel');
      expect(sentText).toContain('Your running balance is -₦12,000');
    });

    it('processes "David paid me 150k for website development." and records income', async () => {
      const message: ParsedMessage = {
        messageId: 'wamid.test.002',
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        timestamp: new Date(),
        type: 'text',
        text: 'David paid me 150k for website development.',
      };

      await handleTextMessage(message);

      const tx = await Transaction.findOne({ userId: testUser._id });
      expect(tx).not.toBeNull();
      expect(tx?.type).toBe('income');
      expect(tx?.amount).toBe(150000);
      expect(tx?.counterparty).toBe('David');

      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('✅ Income recorded');
      expect(sentText).toContain('Amount: ₦150,000');
      expect(sentText).toContain('From: David');
      expect(sentText).toContain('Your running balance is ₦150,000');
    });

    it('handles ambiguous message "I spent money on fuel." by requesting clarification', async () => {
      const message: ParsedMessage = {
        messageId: 'wamid.test.003',
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        timestamp: new Date(),
        type: 'text',
        text: 'I spent money on fuel.',
      };

      await handleTextMessage(message);

      // Verify no transaction was recorded
      const count = await Transaction.countDocuments({ userId: testUser._id });
      expect(count).toBe(0);

      // Verify clarification request
      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('How much did you spend on fuel?');
    });

    it('processes financial queries: "How much did I spend this week?"', async () => {
      // Seed an expense
      await Transaction.create({
        userId: testUser._id,
        type: 'expense',
        amount: 73500,
        currency: 'NGN',
        category: 'food',
        description: 'Groceries',
        source: 'text',
        date: new Date(),
      });

      const message: ParsedMessage = {
        messageId: 'wamid.test.004',
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        timestamp: new Date(),
        type: 'text',
        text: 'How much did I spend this week?',
      };

      await handleTextMessage(message);

      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('📊 *This Week*');
      expect(sentText).toContain('Expenses: ₦73,500');
      expect(sentText).toContain('Food: ₦73,500');
      expect(sentText).toContain('Transactions: 1');
    });

    it('processes largest expense query: "What was my biggest expense?"', async () => {
      await Transaction.create([
        {
          userId: testUser._id,
          type: 'expense',
          amount: 5000,
          currency: 'NGN',
          category: 'fuel',
          source: 'text',
          date: new Date(),
        },
        {
          userId: testUser._id,
          type: 'expense',
          amount: 45000,
          currency: 'NGN',
          category: 'electronics',
          description: 'Keyboard',
          source: 'text',
          date: new Date(),
        },
      ]);

      const message: ParsedMessage = {
        messageId: 'wamid.test.005',
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        timestamp: new Date(),
        type: 'text',
        text: 'What was my biggest expense?',
      };

      await handleTextMessage(message);

      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('Your largest expense this month was ₦45,000 for Electronics');
    });
  });

  describe('Voice Flow: Audio Note → Meta Media Download → AssemblyAI Transcription → AI Intent → Tool → Response', () => {
    it('processes voice income message and saves transcript with source: voice', async () => {
      transcribeAudioSpy.mockResolvedValueOnce({
        transcript: 'I received one hundred and fifty thousand naira from David for website development',
        confidence: 0.97,
      });

      const audioMessage: ParsedMessage = {
        messageId: 'wamid.voice.001',
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        timestamp: new Date(),
        type: 'audio',
        audioMediaId: 'media-audio-12345',
      };

      await handleAudioMessage(audioMessage);

      // Verify Meta media downloaded and AssemblyAI called
      expect(downloadAudioSpy).toHaveBeenCalledWith('media-audio-12345');
      expect(transcribeAudioSpy).toHaveBeenCalledTimes(1);

      // Verify transaction in MongoDB
      const tx = await Transaction.findOne({ userId: testUser._id });
      expect(tx).not.toBeNull();
      expect(tx?.type).toBe('income');
      expect(tx?.amount).toBe(150000);
      expect(tx?.counterparty).toBe('David');
      expect(tx?.source).toBe('voice');
      expect(tx?.transcript).toBe(
        'I received one hundred and fifty thousand naira from David for website development'
      );

      // Verify WhatsApp confirmation response
      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('✅ Income recorded');
      expect(sentText).toContain('Amount: ₦150,000');
      expect(sentText).toContain('From: David');
    });

    it('processes voice expense note: "I spent 5k on food yesterday"', async () => {
      transcribeAudioSpy.mockResolvedValueOnce({
        transcript: 'I spent 5k on food yesterday',
        confidence: 0.95,
      });

      const audioMessage: ParsedMessage = {
        messageId: 'wamid.voice.002',
        senderId: testUser.whatsappId,
        senderName: testUser.name,
        timestamp: new Date(),
        type: 'audio',
        audioMediaId: 'media-audio-99887',
      };

      await handleAudioMessage(audioMessage);

      const tx = await Transaction.findOne({ userId: testUser._id });
      expect(tx).not.toBeNull();
      expect(tx?.type).toBe('expense');
      expect(tx?.amount).toBe(5000);
      expect(tx?.category).toBe('food');
      expect(tx?.source).toBe('voice');

      expect(sendTextMessageSpy).toHaveBeenCalledTimes(1);
      const sentText = sendTextMessageSpy.mock.calls[0][1];
      expect(sentText).toContain('✅ Expense recorded');
      expect(sentText).toContain('Amount: ₦5,000');
      expect(sentText).toContain('Date: Yesterday');
    });
  });
});
