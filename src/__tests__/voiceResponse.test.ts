import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import {
  prepareTextForSpeech,
  synthesizeSpeech,
  sendUserResponse,
} from '../services/tts/ttsService';
import { extractIntent } from '../services/ai/intentExtractor';
import { dispatchIntent } from '../services/tools/toolDispatcher';
import { handleTextMessage } from '../handlers/textHandler';
import { handleAudioMessage } from '../handlers/audioHandler';
import * as whatsappClient from '../services/whatsapp/client';
import * as assemblyaiService from '../services/assemblyai/assemblyai.service';

let textUser: IUserDocument;
let voiceUser: IUserDocument;

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();

  // Create user preferring text mode
  textUser = await User.create({
    whatsappId: '2348011223344',
    name: 'Ada Lovelace',
    profileType: 'personal',
    currency: 'NGN',
    onboardingComplete: true,
    responseMode: 'text',
  });

  // Create user preferring voice mode
  voiceUser = await User.create({
    whatsappId: '2348099887766',
    name: 'Chidi Anagonye',
    profileType: 'personal',
    currency: 'NGN',
    onboardingComplete: true,
    responseMode: 'voice',
  });
});

describe('Phase 13: Voice Response Mode', () => {
  // ── 1. Speech Text Normalization ──────────────────────────────────
  describe('prepareTextForSpeech', () => {
    it('converts currency symbols to spoken words', () => {
      const input = 'Recorded ₦150,000 for website design. Balance is $250.50 and £50.';
      const output = prepareTextForSpeech(input);

      expect(output).toContain('150,000 naira');
      expect(output).toContain('250.50 dollars');
      expect(output).toContain('50 pounds');
      expect(output).not.toContain('₦');
      expect(output).not.toContain('$');
    });

    it('strips emojis, markdown bold, italics, bullets and backticks', () => {
      const input =
        '✅ *Recorded successfully!*\n\n• *Category:* Fuel ⛽\n• *Amount:* ₦12,000\n• *Date:* `Today`';
      const output = prepareTextForSpeech(input);

      expect(output).not.toContain('✅');
      expect(output).not.toContain('⛽');
      expect(output).not.toContain('*');
      expect(output).not.toContain('`');
      expect(output).not.toContain('•');
      expect(output).toContain('Recorded successfully');
      expect(output).toContain('12,000 naira');
    });

    it('truncates excessively long text cleanly', () => {
      const veryLongText = 'A '.repeat(600); // 1200 chars
      const output = prepareTextForSpeech(veryLongText, 200);

      expect(output.length).toBeLessThanOrEqual(205);
      expect(output.endsWith('...')).toBe(true);
    });
  });

  // ── 2. Speech Synthesis ───────────────────────────────────────────
  describe('synthesizeSpeech', () => {
    it('produces valid audio buffer with audio mimeType', async () => {
      const result = await synthesizeSpeech('Your balance is 5000 naira');
      expect(Buffer.isBuffer(result.buffer)).toBe(true);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.mimeType).toMatch(/audio\/(ogg|mpeg)/);
    });

    it('throws error on empty string', async () => {
      await expect(synthesizeSpeech('')).rejects.toThrow('Cannot synthesize speech for empty text');
    });
  });

  // ── 3. Voice & Text Response Delivery ─────────────────────────────
  describe('Voice and Text Response Delivery', () => {
    it('sends audio message when user responseMode is voice (Text → Voice)', async () => {
      const uploadMediaSpy = jest
        .spyOn(whatsappClient, 'uploadMedia')
        .mockResolvedValue('media_voice_111');
      const sendAudioMessageSpy = jest
        .spyOn(whatsappClient, 'sendAudioMessage')
        .mockResolvedValue(undefined);
      const sendTextSpy = jest
        .spyOn(whatsappClient, 'sendTextMessage')
        .mockResolvedValue(undefined);

      const res = await sendUserResponse(voiceUser, '₦12,000 recorded for fuel today');
      expect(res.modeSent).toBe('voice');
      expect(res.mediaId).toBe('media_voice_111');
      expect(uploadMediaSpy).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringMatching(/audio\/(ogg|mpeg)/),
        expect.stringContaining('voice_')
      );
      expect(sendAudioMessageSpy).toHaveBeenCalledWith(voiceUser.whatsappId, 'media_voice_111');
      expect(sendTextSpy).toHaveBeenCalledWith(voiceUser.whatsappId, '₦12,000 recorded for fuel today');

      uploadMediaSpy.mockRestore();
      sendAudioMessageSpy.mockRestore();
      sendTextSpy.mockRestore();
    });

    it('sends text message when user responseMode is text (Voice → Text)', async () => {
      const sendTextSpy = jest
        .spyOn(whatsappClient, 'sendTextMessage')
        .mockResolvedValue(undefined);
      const sendAudioSpy = jest.spyOn(whatsappClient, 'sendAudioMessage');

      const res = await sendUserResponse(textUser, 'You spent ₦12,000 on fuel today.');

      expect(res.modeSent).toBe('text');
      expect(sendTextSpy).toHaveBeenCalledWith(
        textUser.whatsappId,
        'You spent ₦12,000 on fuel today.'
      );
      expect(sendAudioSpy).not.toHaveBeenCalled();

      sendTextSpy.mockRestore();
      sendAudioSpy.mockRestore();
    });

    it('falls back to text message when voice generation or upload fails', async () => {
      // Mock uploadMedia failure
      const uploadMediaSpy = jest
        .spyOn(whatsappClient, 'uploadMedia')
        .mockRejectedValue(new Error('Meta Media Upload Error 503'));
      const sendTextSpy = jest
        .spyOn(whatsappClient, 'sendTextMessage')
        .mockResolvedValue(undefined);
      const sendAudioSpy = jest.spyOn(whatsappClient, 'sendAudioMessage');

      const res = await sendUserResponse(voiceUser, 'You spent ₦12,000 on fuel today.');

      expect(res.modeSent).toBe('text');
      expect(sendTextSpy).toHaveBeenCalledWith(
        voiceUser.whatsappId,
        'You spent ₦12,000 on fuel today.'
      );
      expect(sendAudioSpy).not.toHaveBeenCalled();

      uploadMediaSpy.mockRestore();
      sendTextSpy.mockRestore();
      sendAudioSpy.mockRestore();
    });
  });

  // ── 4. End-to-End Handlers with Voice Response ────────────────────
  describe('End-to-End Handler Integration', () => {
    it('voice note in -> audio response out when user has voice mode enabled (Voice → Voice)', async () => {
      jest.spyOn(whatsappClient, 'downloadWhatsAppAudio').mockResolvedValue({
        buffer: Buffer.from('fake_audio'),
        mimeType: 'audio/ogg',
      });
      jest.spyOn(assemblyaiService, 'transcribeAudio').mockResolvedValue({
        transcript: 'I spent 5000 on lunch today',
        confidence: 0.95,
      });

      const uploadMediaSpy = jest
        .spyOn(whatsappClient, 'uploadMedia')
        .mockResolvedValue('media_voice_222');
      const sendAudioSpy = jest
        .spyOn(whatsappClient, 'sendAudioMessage')
        .mockResolvedValue(undefined);
      const sendTextSpy = jest
        .spyOn(whatsappClient, 'sendTextMessage')
        .mockResolvedValue(undefined);

      await handleAudioMessage({
        senderId: voiceUser.whatsappId,
        messageId: 'wamid.voice001',
        timestamp: new Date(),
        type: 'audio',
        audioMediaId: 'audio_media_incoming',
      });

      expect(sendAudioSpy).toHaveBeenCalledWith(voiceUser.whatsappId, 'media_voice_222');

      uploadMediaSpy.mockRestore();
      sendAudioSpy.mockRestore();
      sendTextSpy.mockRestore();
    });

    it('text message in -> audio response out when user has voice mode enabled (Text → Voice)', async () => {
      const uploadMediaSpy = jest
        .spyOn(whatsappClient, 'uploadMedia')
        .mockResolvedValue('media_voice_333');
      const sendAudioSpy = jest
        .spyOn(whatsappClient, 'sendAudioMessage')
        .mockResolvedValue(undefined);
      const sendTextSpy = jest
        .spyOn(whatsappClient, 'sendTextMessage')
        .mockResolvedValue(undefined);

      await handleTextMessage({
        senderId: voiceUser.whatsappId,
        messageId: 'wamid.text001',
        timestamp: new Date(),
        type: 'text',
        text: 'What is my balance?',
      });

      expect(sendAudioSpy).toHaveBeenCalledWith(voiceUser.whatsappId, 'media_voice_333');

      uploadMediaSpy.mockRestore();
      sendAudioSpy.mockRestore();
      sendTextSpy.mockRestore();
    });
  });

  // ── 5. Mode Switching Commands ────────────────────────────────────
  describe('Mode Switching Commands', () => {
    it('switches to voice mode on "Reply with voice."', async () => {
      const intent = await extractIntent('Reply with voice.');
      expect(intent.intent).toBe('profile_update');
      if (intent.intent === 'profile_update') {
        expect(intent.fields.responseMode).toBe('voice');
      }

      const response = await dispatchIntent(intent, {
        user: textUser,
        source: 'text',
        whatsappMessageId: 'wamid.switch001',
      });

      expect(response).toContain('Voice response mode enabled');
      expect(textUser.responseMode).toBe('voice');

      const updated = await User.findById(textUser._id);
      expect(updated?.responseMode).toBe('voice');
    });

    it('switches to text mode on "Text responses please."', async () => {
      const intent = await extractIntent('Text responses please.');
      expect(intent.intent).toBe('profile_update');
      if (intent.intent === 'profile_update') {
        expect(intent.fields.responseMode).toBe('text');
      }

      const response = await dispatchIntent(intent, {
        user: voiceUser,
        source: 'text',
        whatsappMessageId: 'wamid.switch002',
      });

      expect(response).toContain('Text response mode enabled');
      expect(voiceUser.responseMode).toBe('text');

      const updated = await User.findById(voiceUser._id);
      expect(updated?.responseMode).toBe('text');
    });
  });
});
