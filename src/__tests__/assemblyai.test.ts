import axios from 'axios';
import {
  transcribeAudio,
  AssemblyAIError,
  setAssemblyAIClient,
  isSupportedAudioFormat,
} from '../services/assemblyai/assemblyai.service';
import {
  getMediaInfo,
  downloadWhatsAppAudio,
} from '../services/whatsapp/client';
import {
  handleAudioMessage,
  NO_AUDIO_MEDIA_MESSAGE,
  EMPTY_TRANSCRIPT_MESSAGE,
  VOICE_PROCESSING_ERROR_MESSAGE,
} from '../handlers/audioHandler';
import { ParsedMessage } from '../types/whatsapp';
import { AssemblyAI } from 'assemblyai';

jest.mock('axios');
jest.mock('../config/env', () => ({
  env: {
    META_WHATSAPP_ACCESS_TOKEN: 'test-meta-token',
    META_WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    META_GRAPH_API_VERSION: 'v19.0',
    ASSEMBLYAI_API_KEY: 'test-assemblyai-key',
  },
}));

jest.mock('../services/whatsapp/client', () => {
  const original = jest.requireActual('../services/whatsapp/client');
  return {
    ...original,
    sendTextMessage: jest.fn().mockResolvedValue(undefined),
  };
});

const mockedAxios = jest.mocked(axios);
const { sendTextMessage } = jest.requireMock('../services/whatsapp/client') as {
  sendTextMessage: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  setAssemblyAIClient(null);
});

describe('Phase 6 — AssemblyAI Voice Transcription & Media Download', () => {
  // ── 1. AssemblyAI Service Tests ──────────────────────────────
  describe('transcribeAudio service', () => {
    it('transcribes valid audio buffer successfully and returns transcript & confidence', async () => {
      const mockTranscribe = jest.fn().mockResolvedValue({
        status: 'completed',
        text: 'I spent twelve thousand naira on fuel today.',
        confidence: 0.95,
      });

      const mockClient = {
        transcripts: {
          transcribe: mockTranscribe,
        },
      } as unknown as AssemblyAI;

      setAssemblyAIClient(mockClient);

      const fakeAudioBuffer = Buffer.from('fake-ogg-opus-audio-data');
      const result = await transcribeAudio(fakeAudioBuffer, 'audio/ogg; codecs=opus');

      expect(result).toEqual({
        transcript: 'I spent twelve thousand naira on fuel today.',
        confidence: 0.95,
      });
      expect(mockTranscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          audio: fakeAudioBuffer,
          speech_models: ['universal-3-5-pro', 'universal-2'],
        })
      );
    });

    it('rejects empty audio buffer with AssemblyAIError', async () => {
      const emptyBuffer = Buffer.alloc(0);
      await expect(transcribeAudio(emptyBuffer)).rejects.toThrow(AssemblyAIError);
      await expect(transcribeAudio(emptyBuffer)).rejects.toThrow('Audio buffer is empty');
    });

    it('rejects audio buffer exceeding 25MB limit', async () => {
      const largeBuffer = Buffer.alloc(26 * 1024 * 1024);
      await expect(transcribeAudio(largeBuffer)).rejects.toThrow(AssemblyAIError);
      await expect(transcribeAudio(largeBuffer)).rejects.toThrow('exceeds maximum limit of 25MB');
    });

    it('rejects unsupported audio MIME types', async () => {
      const buffer = Buffer.from('fake-audio');
      await expect(transcribeAudio(buffer, 'video/mp4')).rejects.toThrow(AssemblyAIError);
      await expect(transcribeAudio(buffer, 'video/mp4')).rejects.toThrow('Unsupported audio MIME type');
    });

    it('handles AssemblyAI status=error response', async () => {
      const mockTranscribe = jest.fn().mockResolvedValue({
        status: 'error',
        error: 'Corrupted audio file header',
      });

      setAssemblyAIClient({
        transcripts: { transcribe: mockTranscribe },
      } as unknown as AssemblyAI);

      const buffer = Buffer.from('corrupted-audio');
      await expect(transcribeAudio(buffer)).rejects.toThrow(
        'Corrupted audio file header'
      );
    });

    it('sanitizes API keys when AssemblyAI SDK throws an error', async () => {
      const mockTranscribe = jest.fn().mockRejectedValue(
        new Error('Request failed with test-assemblyai-key in URL')
      );

      setAssemblyAIClient({
        transcripts: { transcribe: mockTranscribe },
      } as unknown as AssemblyAI);

      const buffer = Buffer.from('some-audio');
      let thrown: unknown;
      try {
        await transcribeAudio(buffer);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(AssemblyAIError);
      expect((thrown as AssemblyAIError).message).not.toContain('test-assemblyai-key');
      expect((thrown as AssemblyAIError).message).toContain('[REDACTED]');
    });
  });

  // ── 2. MIME Type Support Helper ──────────────────────────────
  describe('isSupportedAudioFormat', () => {
    it('accepts WhatsApp common audio MIME formats', () => {
      expect(isSupportedAudioFormat('audio/ogg; codecs=opus')).toBe(true);
      expect(isSupportedAudioFormat('audio/ogg')).toBe(true);
      expect(isSupportedAudioFormat('audio/opus')).toBe(true);
      expect(isSupportedAudioFormat('audio/mp4')).toBe(true);
      expect(isSupportedAudioFormat('audio/m4a')).toBe(true);
      expect(isSupportedAudioFormat('audio/aac')).toBe(true);
      expect(isSupportedAudioFormat('audio/amr')).toBe(true);
      expect(isSupportedAudioFormat('audio/mpeg')).toBe(true);
    });

    it('rejects video or image formats', () => {
      expect(isSupportedAudioFormat('image/jpeg')).toBe(false);
      expect(isSupportedAudioFormat('text/plain')).toBe(false);
      expect(isSupportedAudioFormat('application/pdf')).toBe(false);
    });
  });

  // ── 3. Meta Media Retrieval & Download ───────────────────────
  describe('WhatsApp Media Retrieval & Download', () => {
    it('retrieves media URL from Meta Graph API', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          url: 'https://lookaside.fbsbx.com/whatsapp_media/abc123',
          mime_type: 'audio/ogg; codecs=opus',
          file_size: 45000,
          id: 'media_123',
        },
      });

      const mediaInfo = await getMediaInfo('media_123');

      expect(mediaInfo).toEqual({
        url: 'https://lookaside.fbsbx.com/whatsapp_media/abc123',
        mimeType: 'audio/ogg; codecs=opus',
        fileSize: 45000,
        id: 'media_123',
      });
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://graph.facebook.com/v19.0/media_123',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-meta-token',
          }),
        })
      );
    });

    it('downloads audio buffer binary data from Meta URL', async () => {
      // Step 1: getMediaInfo mock
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          url: 'https://lookaside.fbsbx.com/media_download_url',
          mime_type: 'audio/ogg; codecs=opus',
          file_size: 1024,
          id: 'media_456',
        },
      });

      // Step 2: binary download mock
      const mockBinary = Buffer.from('test-ogg-binary-audio');
      mockedAxios.get.mockResolvedValueOnce({
        data: mockBinary,
      });

      const downloaded = await downloadWhatsAppAudio('media_456');

      expect(downloaded.mimeType).toBe('audio/ogg; codecs=opus');
      expect(downloaded.buffer.toString()).toBe('test-ogg-binary-audio');
    });

    it('throws WhatsAppApiError when media retrieval returns Meta API error', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          error: {
            message: 'Media not found',
            code: 100,
            type: 'OAuthException',
          },
        },
      });

      await expect(getMediaInfo('invalid_media_id')).rejects.toThrow(
        'Media not found'
      );
    });

    it('throws WhatsAppApiError when downloaded audio buffer is empty', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          url: 'https://lookaside.fbsbx.com/empty_audio',
          mime_type: 'audio/ogg',
          id: 'media_empty',
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.alloc(0).buffer,
      });

      await expect(downloadWhatsAppAudio('media_empty')).rejects.toThrow(
        'Downloaded audio buffer is empty'
      );
    });
  });

  // ── 4. Audio Message Handler Integration ─────────────────────
  describe('handleAudioMessage handler', () => {
    it('downloads, transcribes, and replies with transcript', async () => {
      // Mock getMediaInfo & binary download
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          url: 'https://lookaside.fbsbx.com/voice_sample',
          mime_type: 'audio/ogg; codecs=opus',
          id: 'media_voice_001',
        },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('voice-audio-bytes').buffer,
      });

      // Mock AssemblyAI client
      const mockTranscribe = jest.fn().mockResolvedValue({
        status: 'completed',
        text: 'I spent twelve thousand naira on fuel today.',
        confidence: 0.98,
      });
      setAssemblyAIClient({
        transcripts: { transcribe: mockTranscribe },
      } as unknown as AssemblyAI);

      const audioMsg: ParsedMessage = {
        senderId: '2348100000001',
        senderName: 'Jane Doe',
        messageId: 'wamid.audio_test_001',
        type: 'audio',
        audioMediaId: 'media_voice_001',
        timestamp: new Date(),
      };

      const result = await handleAudioMessage(audioMsg);

      expect(result).toEqual({
        transcript: 'I spent twelve thousand naira on fuel today.',
        confidence: 0.98,
      });
      expect(sendTextMessage).toHaveBeenCalledWith(
        '2348100000001',
        'I spent twelve thousand naira on fuel today.'
      );
    });

    it('handles audio message missing audioMediaId gracefully', async () => {
      const missingMediaMsg: ParsedMessage = {
        senderId: '2348100000001',
        messageId: 'wamid.no_media',
        type: 'audio',
        timestamp: new Date(),
      };

      await handleAudioMessage(missingMediaMsg);

      expect(sendTextMessage).toHaveBeenCalledWith(
        '2348100000001',
        NO_AUDIO_MEDIA_MESSAGE
      );
    });

    it('handles silent / empty transcript gracefully', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          url: 'https://lookaside.fbsbx.com/silent',
          mime_type: 'audio/ogg',
          id: 'media_silent',
        },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: Buffer.from('silent-audio').buffer,
      });

      setAssemblyAIClient({
        transcripts: {
          transcribe: jest.fn().mockResolvedValue({
            status: 'completed',
            text: '',
          }),
        },
      } as unknown as AssemblyAI);

      const msg: ParsedMessage = {
        senderId: '2348100000001',
        messageId: 'wamid.silent_001',
        type: 'audio',
        audioMediaId: 'media_silent',
        timestamp: new Date(),
      };

      await handleAudioMessage(msg);

      expect(sendTextMessage).toHaveBeenCalledWith(
        '2348100000001',
        EMPTY_TRANSCRIPT_MESSAGE
      );
    });

    it('handles transcription/download errors gracefully with friendly message', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network connection failed'));

      const msg: ParsedMessage = {
        senderId: '2348100000001',
        messageId: 'wamid.error_001',
        type: 'audio',
        audioMediaId: 'media_error',
        timestamp: new Date(),
      };

      await handleAudioMessage(msg);

      expect(sendTextMessage).toHaveBeenCalledWith(
        '2348100000001',
        VOICE_PROCESSING_ERROR_MESSAGE
      );
    });
  });
});
