import {
  extractIntentWithGroq,
  generateInteractiveResponseWithGroq,
  transcribeAudioWithGroq,
  setGroqClient,
} from '../services/ai/groqService';
import { extractIntent } from '../services/ai/intentExtractor';
import { dispatchIntent } from '../services/tools/toolDispatcher';
import { IUserDocument } from '../models/User';
import Groq from 'groq-sdk';
import { cleanWhatsAppFormatting } from '../utils/whatsappFormatter';

jest.mock('../services/tools/userProfile', () => ({
  updateUserProfile: jest.fn().mockResolvedValue(null),
}));

describe('Groq AI Integration & Interactive Personalization', () => {
  afterEach(() => {
    setGroqClient(null);
    jest.restoreAllMocks();
  });

  describe('extractIntentWithGroq', () => {
    it('successfully extracts a structured expense intent for Nigerian Pidgin', async () => {
      const mockChatCreate = jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'record_transaction',
                transaction: {
                  type: 'expense',
                  amount: 5000,
                  currency: 'NGN',
                  category: 'Fuel',
                  description: 'Fuel for generator',
                  counterparty: null,
                  date: '2026-09-27',
                },
              }),
            },
          },
        ],
      });

      const mockGroq = {
        chat: { completions: { create: mockChatCreate } },
      } as unknown as Groq;

      setGroqClient(mockGroq);

      const intent = await extractIntentWithGroq('Comot 5k for fuel', {
        defaultCurrency: 'NGN',
        userName: 'Japheth',
      });

      expect(intent).not.toBeNull();
      expect(intent?.intent).toBe('record_transaction');
      if (intent?.intent === 'record_transaction') {
        expect(intent.transaction.amount).toBe(5000);
        expect(intent.transaction.category).toBe('Fuel');
      }
      expect(mockChatCreate).toHaveBeenCalledTimes(1);
    });

    it('returns clarification_required when an amount is omitted', async () => {
      const mockChatCreate = jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                intent: 'clarification_required',
                missing: ['amount'],
                clarificationPrompt: 'Hey Japheth, how much did you spend on fuel?',
                partial: {
                  type: 'expense',
                  category: 'Fuel',
                  description: 'Fuel',
                },
              }),
            },
          },
        ],
      });

      const mockGroq = {
        chat: { completions: { create: mockChatCreate } },
      } as unknown as Groq;

      setGroqClient(mockGroq);

      const intent = await extractIntentWithGroq('I buy fuel today', {
        defaultCurrency: 'NGN',
        userName: 'Japheth',
      });

      expect(intent).not.toBeNull();
      expect(intent?.intent).toBe('clarification_required');
      if (intent?.intent === 'clarification_required') {
        expect(intent.missing).toContain('amount');
        expect(intent.clarificationPrompt).toContain('Japheth');
      }
    });

    it('returns null gracefully on JSON parse error or API failure', async () => {
      const mockChatCreate = jest.fn().mockRejectedValue(new Error('Groq rate limited'));

      const mockGroq = {
        chat: { completions: { create: mockChatCreate } },
      } as unknown as Groq;

      setGroqClient(mockGroq);

      const intent = await extractIntentWithGroq('Spent 2000 on lunch');
      expect(intent).toBeNull();
    });
  });

  describe('generateInteractiveResponseWithGroq', () => {
    it('generates an interactive personalized message addressing the user by preferred name', async () => {
      const mockChatCreate = jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content:
                "Got you covered, Japheth! ⛽ I've recorded ₦5,000 for fuel. Your new running balance is -₦5,000.",
            },
          },
        ],
      });

      const mockGroq = {
        chat: { completions: { create: mockChatCreate } },
      } as unknown as Groq;

      setGroqClient(mockGroq);

      const response = await generateInteractiveResponseWithGroq({
        userName: 'Japheth',
        userMessage: 'Comot 5k for fuel',
        toolResultText:
          '✅ Expense recorded\nAmount: ₦5,000\nCategory: Fuel\nYour running balance is -₦5,000.',
      });

      expect(response).toContain('Japheth');
      expect(response).toContain('₦5,000');
    });

    it('falls back to prepending the user name when Groq is not available', async () => {
      setGroqClient(null);

      const response = await generateInteractiveResponseWithGroq({
        userName: 'Japheth',
        userMessage: 'Balance',
        toolResultText: '💰 Your current balance is ₦50,000.',
      });

      expect(response).toContain('Hey Japheth!');
      expect(response).toContain('₦50,000');
    });
  });

  describe('transcribeAudioWithGroq', () => {
    it('calls Groq audio transcription with Whisper-large-v3 and accent prompt', async () => {
      const mockTranscriptionCreate = jest.fn().mockResolvedValue({
        text: 'I spent 5000 naira on fuel today',
      });

      const mockGroq = {
        audio: { transcriptions: { create: mockTranscriptionCreate } },
      } as unknown as Groq;

      setGroqClient(mockGroq);

      const dummyBuffer = Buffer.from('test-audio-content');
      const result = await transcribeAudioWithGroq(dummyBuffer, 'audio/ogg');

      expect(result.transcript).toBe('I spent 5000 naira on fuel today');
      expect(mockTranscriptionCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'whisper-large-v3',
          language: 'en',
        })
      );
    });
  });

  describe('Preferred Name Interaction & Updates', () => {
    it('extracts "Call me Japheth" as a profile_update intent', async () => {
      const intent = await extractIntent('Call me Japheth');
      expect(intent.intent).toBe('profile_update');
      if (intent.intent === 'profile_update') {
        expect(intent.fields.name).toBe('Japheth');
      }
    });

    it('extracts "My name is Tunde" as a profile_update intent', async () => {
      const intent = await extractIntent('My name is Tunde');
      expect(intent.intent).toBe('profile_update');
      if (intent.intent === 'profile_update') {
        expect(intent.fields.name).toBe('Tunde');
      }
    });

    it('dispatchIntent warmly welcomes the user by their updated name', async () => {
      const mockUser = {
        _id: '507f1f77bcf86cd799439011',
        whatsappId: '2348011223344',
        name: 'OldName',
        currency: 'NGN',
      } as unknown as IUserDocument;

      const reply = await dispatchIntent(
        {
          intent: 'profile_update',
          fields: { name: 'Japheth' },
        },
        {
          user: mockUser,
          source: 'text',
          whatsappMessageId: 'wamid.123',
        }
      );

      expect(reply).toContain('Japheth');
      expect(reply).toContain('Nice to meet you');
      expect(mockUser.name).toBe('Japheth');
    });
  });

  describe('cleanWhatsAppFormatting', () => {
    it('strips markdown headers (###, ##, #) and converts them to bold *...*', () => {
      const input = '### 1️⃣ Track every *kobo* you spend\n## 2️⃣ Spot the spenders\n# 3️⃣ Budget';
      const output = cleanWhatsAppFormatting(input);
      expect(output).toContain('*1️⃣ Track every kobo you spend*');
      expect(output).toContain('*2️⃣ Spot the spenders*');
      expect(output).toContain('*3️⃣ Budget*');
      expect(output).not.toContain('###');
      expect(output).not.toContain('##');
      expect(output).not.toContain('# 3️⃣');
    });

    it('removes horizontal divider lines like --- and cleans mismatched asterisks', () => {
      const input = 'Header\n---\n“Spent **5k* for suya today”*\n---';
      const output = cleanWhatsAppFormatting(input);
      expect(output).not.toContain('---');
      expect(output).toContain('“Spent *5k* for suya today”');
    });
  });
});

