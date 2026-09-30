import request from 'supertest';
import crypto from 'crypto';
import { app } from '../app';
import { isKapsoWebhookPayload, parseWebhookMessage } from '../services/whatsapp/messageParser';
import { verifyKapsoSignature } from '../controllers/webhookController';
import { KapsoWebhookPayload } from '../types/whatsapp';

// Mock idempotency to avoid Mongo dependency during unit tests
jest.mock('../utils/idempotency', () => ({
  isMessageProcessed: jest.fn().mockResolvedValue(false),
  markMessageProcessed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../services/messageRouter', () => ({
  routeMessage: jest.fn().mockResolvedValue(undefined),
}));

// Mock WhatsApp send client so we can inspect outbound replies
const mockSendTextMessage = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/whatsapp/client', () => {
  const original = jest.requireActual('../services/whatsapp/client');
  return {
    ...original,
    sendTextMessage: (...args: unknown[]) => mockSendTextMessage(...args),
  };
});

describe('Kapso Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isKapsoWebhookPayload', () => {
    it('recognizes a valid Kapso message.received payload', () => {
      const payload = {
        message: {
          id: 'wamid.kapso001',
          timestamp: '1730092800',
          type: 'text',
          text: { body: 'Hello Kapso' },
          kapso: {
            direction: 'inbound',
            status: 'received',
            content: 'Hello Kapso',
          },
        },
        conversation: {
          id: 'conv_001',
          phone_number: '+12012700747',
          status: 'active',
          kapso: {
            contact_name: 'Test User',
          },
        },
        phone_number_id: '1284505108085241',
      };

      expect(isKapsoWebhookPayload(payload)).toBe(true);
    });

    it('rejects payloads missing message object', () => {
      expect(isKapsoWebhookPayload({})).toBe(false);
      expect(isKapsoWebhookPayload(null)).toBe(false);
      expect(isKapsoWebhookPayload({ object: 'whatsapp_business_account' })).toBe(false);
    });
  });

  describe('parseWebhookMessage (Kapso payloads)', () => {
    it('correctly parses inbound text message from Kapso', () => {
      const payload: KapsoWebhookPayload = {
        message: {
          id: 'wamid.kapso_text_1',
          timestamp: '1730092800',
          type: 'text',
          text: { body: 'Spent 3000 on lunch' },
          kapso: {
            direction: 'inbound',
            status: 'received',
            content: 'Spent 3000 on lunch',
          },
        },
        conversation: {
          id: 'conv_123',
          phone_number: '+2348100000001',
          kapso: {
            contact_name: 'Amara',
          },
        },
        phone_number_id: '1284505108085241',
      };

      const parsed = parseWebhookMessage(payload);
      expect(parsed).not.toBeNull();
      expect(parsed?.messageId).toBe('wamid.kapso_text_1');
      expect(parsed?.senderId).toBe('2348100000001');
      expect(parsed?.senderName).toBe('Amara');
      expect(parsed?.type).toBe('text');
      expect(parsed?.text).toBe('Spent 3000 on lunch');
    });

    it('correctly parses inbound audio message from Kapso', () => {
      const payload: KapsoWebhookPayload = {
        message: {
          id: 'wamid.kapso_audio_1',
          timestamp: '1730092900',
          type: 'audio',
          audio: { id: 'media_kapso_99' },
          kapso: {
            direction: 'inbound',
            status: 'received',
            has_media: true,
            media_url: 'https://api.kapso.ai/media/media_kapso_99',
          },
        },
        conversation: {
          phone_number: '2348100000002',
          kapso: { contact_name: 'David' },
        },
      };

      const parsed = parseWebhookMessage(payload);
      expect(parsed).not.toBeNull();
      expect(parsed?.messageId).toBe('wamid.kapso_audio_1');
      expect(parsed?.senderId).toBe('2348100000002');
      expect(parsed?.type).toBe('audio');
      expect(parsed?.audioMediaId).toBe('media_kapso_99');
    });

    it('ignores outbound messages (echoes)', () => {
      const outboundPayload: KapsoWebhookPayload = {
        message: {
          id: 'wamid.kapso_outbound_1',
          timestamp: '1730093000',
          type: 'text',
          text: { body: 'Here is your receipt' },
          kapso: {
            direction: 'outbound',
            status: 'sent',
          },
        },
        conversation: {
          phone_number: '+2348100000001',
        },
      };

      const parsed = parseWebhookMessage(outboundPayload);
      expect(parsed).toBeNull();
    });
  });

  describe('verifyKapsoSignature', () => {
    const secret = 'test-kapso-secret-123';
    const body = { test: 'payload' };
    const rawBody = JSON.stringify(body);
    const validSig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    it('returns true for matching signature', () => {
      expect(verifyKapsoSignature(secret, body, validSig)).toBe(true);
    });

    it('returns false for tampered signature', () => {
      expect(verifyKapsoSignature(secret, body, 'bad-signature')).toBe(false);
    });

    it('returns false if signature header is missing or empty', () => {
      expect(verifyKapsoSignature(secret, body, undefined)).toBe(false);
      expect(verifyKapsoSignature(secret, body, '')).toBe(false);
    });
  });

  describe('POST /webhook/whatsapp with Kapso payload', () => {
    it('accepts and routes Kapso inbound text message', async () => {
      const payload: KapsoWebhookPayload = {
        message: {
          id: 'wamid.kapso_webhook_test',
          timestamp: '1730092800',
          type: 'text',
          text: { body: 'Hello' },
          kapso: {
            direction: 'inbound',
            status: 'received',
          },
        },
        conversation: {
          phone_number: '+2348100000001',
          kapso: {
            contact_name: 'Test User',
          },
        },
        phone_number_id: '1284505108085241',
      };

      const res = await request(app)
        .post('/webhook/whatsapp')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });
  });
});
