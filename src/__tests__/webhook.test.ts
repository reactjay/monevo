import request from 'supertest';
import { app } from '../app';
import { parseWebhookMessage, isValidWebhookPayload } from '../services/whatsapp/messageParser';
import { makeTextPayload, makeAudioPayload, makeStatusPayload, SENDER_ID } from './fixtures/webhookPayloads';
import { WELCOME_MESSAGE } from '../handlers/textHandler';

import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User } from '../models/User';
import { ConversationState } from '../models/ConversationState';
import { ONBOARDING_WELCOME_MESSAGE } from '../services/onboarding/onboardingService';

// Mock idempotency so webhook tests don't rely on idempotency collection
jest.mock('../utils/idempotency', () => ({
  isMessageProcessed: jest.fn().mockResolvedValue(false),
  markMessageProcessed: jest.fn().mockResolvedValue(undefined),
}));

// Mock the WhatsApp client so no real HTTP calls are made during tests
jest.mock('../services/whatsapp/client', () => ({
  sendTextMessage: jest.fn().mockResolvedValue(undefined),
  sendImageMessage: jest.fn().mockResolvedValue(undefined),
  sendAudioMessage: jest.fn().mockResolvedValue(undefined),
  uploadMedia: jest.fn().mockResolvedValue('mock-media-id'),
  downloadWhatsAppAudio: jest.fn().mockResolvedValue({
    buffer: Buffer.from('mock-audio-data'),
    mimeType: 'audio/ogg; codecs=opus',
  }),
}));

jest.mock('../services/assemblyai/assemblyai.service', () => ({
  transcribeAudio: jest.fn().mockResolvedValue({
    transcript: 'I spent 5000 naira on fuel today',
    confidence: 0.95,
  }),
}));

const { isMessageProcessed } = jest.requireMock('../utils/idempotency') as {
  isMessageProcessed: jest.Mock;
};
const { sendTextMessage } = jest.requireMock('../services/whatsapp/client') as {
  sendTextMessage: jest.Mock;
};

// Token is set in src/__tests__/setup/testEnv.ts before module import
const VERIFY_TOKEN = 'test-verify-token';

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();
  isMessageProcessed.mockReset();
  isMessageProcessed.mockResolvedValue(false);
});

// ── GET /webhook and /webhook/whatsapp — Verification ──────────────

describe('GET /webhook/whatsapp and /webhook — verification', () => {
  it('returns the challenge for a valid verify token on /webhook/whatsapp', async () => {
    const res = await request(app)
      .get('/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'abc123challenge',
      });

    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123challenge');
  });

  it('returns the challenge for a valid verify token on /webhook', async () => {
    const res = await request(app)
      .get('/webhook')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'abc123challenge',
      });

    expect(res.status).toBe(200);
    expect(res.text).toBe('abc123challenge');
  });

  it('returns 403 for wrong verify token', async () => {
    const res = await request(app)
      .get('/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'WRONG_TOKEN',
        'hub.challenge': 'abc123',
      });

    expect(res.status).toBe(403);
  });

  it('returns 403 when mode is not subscribe', async () => {
    const res = await request(app)
      .get('/webhook/whatsapp')
      .query({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': VERIFY_TOKEN,
        'hub.challenge': 'abc123',
      });

    expect(res.status).toBe(403);
  });

  it('returns 400 when hub parameters are missing', async () => {
    const res = await request(app).get('/webhook/whatsapp');

    expect(res.status).toBe(400);
  });
});

// ── POST /webhook/whatsapp — Incoming messages ────────────────

describe('POST /webhook/whatsapp — incoming messages', () => {
  it('returns 200 for a valid text message', async () => {
    const payload = makeTextPayload('wamid.text001', 'I spent 5000 on food');

    const res = await request(app).post('/webhook/whatsapp').send(payload);

    expect(res.status).toBe(200);
  });

  it('returns 200 for a valid audio message', async () => {
    const payload = makeAudioPayload('wamid.audio001', 'media_id_abc');

    const res = await request(app).post('/webhook/whatsapp').send(payload);

    expect(res.status).toBe(200);
  });

  it('returns 200 for a status update (not a message)', async () => {
    const payload = makeStatusPayload('wamid.status001');

    const res = await request(app).post('/webhook/whatsapp').send(payload);

    expect(res.status).toBe(200);
  });

  it('returns 200 for a malformed / non-WhatsApp payload', async () => {
    const res = await request(app)
      .post('/webhook/whatsapp')
      .send({ random: 'garbage', not: 'whatsapp' });

    expect(res.status).toBe(200);
  });

  it('returns 200 for an empty body', async () => {
    const res = await request(app).post('/webhook/whatsapp').send({});

    expect(res.status).toBe(200);
  });

  it('calls isMessageProcessed for a real message', async () => {
    const payload = makeTextPayload('wamid.check001', 'hello');

    await request(app).post('/webhook/whatsapp').send(payload);

    expect(isMessageProcessed).toHaveBeenCalledWith('wamid.check001');
  });

  it('skips processing for a duplicate message ID', async () => {
    isMessageProcessed.mockResolvedValueOnce(true);

    const payload = makeTextPayload('wamid.dup001', 'duplicate message');
    const res = await request(app).post('/webhook/whatsapp').send(payload);

    expect(res.status).toBe(200);
    expect(isMessageProcessed).toHaveBeenCalledWith('wamid.dup001');
  });

  it('does not call sendTextMessage for a duplicate message', async () => {
    isMessageProcessed.mockResolvedValueOnce(true);
    const payload = makeTextPayload('wamid.dup002', 'already seen');
    await request(app).post('/webhook/whatsapp').send(payload);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });
});

// ── Message routing integration tests ────────────────────────

describe('POST /webhook/whatsapp — message routing', () => {
  it('sends the onboarding welcome message in response to incoming text from a new user', async () => {
    const payload = makeTextPayload('wamid.route001', 'Hello');
    await request(app).post('/webhook/whatsapp').send(payload);

    expect(sendTextMessage).toHaveBeenCalledWith(SENDER_ID, ONBOARDING_WELCOME_MESSAGE);
  });

  it('sends the financial assistant welcome message in response to incoming text from an onboarded user', async () => {
    const onboardedSender = '2348100000099';
    await User.create({
      whatsappId: onboardedSender,
      profileType: 'personal',
      name: 'Existing User',
      currency: 'NGN',
      onboardingComplete: true,
    });
    await ConversationState.create({
      whatsappId: onboardedSender,
      state: 'COMPLETED',
      context: {},
    });

    const payload = makeTextPayload('wamid.route001b', 'Hello', onboardedSender);
    await request(app).post('/webhook/whatsapp').send(payload);

    expect(sendTextMessage).toHaveBeenCalledWith(onboardedSender, WELCOME_MESSAGE);
  });

  it('transcribes and replies to incoming audio messages', async () => {
    const payload = makeAudioPayload('wamid.route002', 'media_ogg_001');
    await request(app).post('/webhook/whatsapp').send(payload);

    expect(sendTextMessage).toHaveBeenCalledWith(
      SENDER_ID,
      'I spent 5000 naira on fuel today'
    );
  });

  it('does not send any reply for a status update', async () => {
    const payload = makeStatusPayload('wamid.route003');
    await request(app).post('/webhook/whatsapp').send(payload);

    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('still returns 200 even when sendTextMessage throws', async () => {
    sendTextMessage.mockRejectedValueOnce(new Error('WhatsApp API unavailable'));

    const payload = makeTextPayload('wamid.route004', 'Hello');
    const res = await request(app).post('/webhook/whatsapp').send(payload);

    expect(res.status).toBe(200);
  });
});

// ── Message parser unit tests ─────────────────────────────────

describe('parseWebhookMessage', () => {
  it('extracts a text message correctly', () => {
    const payload = makeTextPayload('wamid.parse001', 'I spent 12000 on fuel');
    const result = parseWebhookMessage(payload);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('text');
    expect(result?.senderId).toBe('2348100000001');
    expect(result?.messageId).toBe('wamid.parse001');
    expect(result?.text).toBe('I spent 12000 on fuel');
    expect(result?.senderName).toBe('Test User');
    expect(result?.timestamp).toBeInstanceOf(Date);
  });

  it('extracts an audio message correctly', () => {
    const payload = makeAudioPayload('wamid.parse002', 'media_xyz');
    const result = parseWebhookMessage(payload);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('audio');
    expect(result?.audioMediaId).toBe('media_xyz');
    expect(result?.text).toBeUndefined();
  });

  it('returns null for a status update payload', () => {
    const payload = makeStatusPayload('wamid.status001');
    const result = parseWebhookMessage(payload);

    expect(result).toBeNull();
  });

  it('returns null for a non-WhatsApp object type', () => {
    const payload = { object: 'instagram', entry: [] } as Parameters<
      typeof parseWebhookMessage
    >[0];
    const result = parseWebhookMessage(payload);

    expect(result).toBeNull();
  });

  it('returns null for an empty entry array', () => {
    const payload = { object: 'whatsapp_business_account', entry: [] };
    const result = parseWebhookMessage(
      payload as Parameters<typeof parseWebhookMessage>[0]
    );

    expect(result).toBeNull();
  });
});

// ── Payload validator ─────────────────────────────────────────

describe('isValidWebhookPayload', () => {
  it('accepts a well-formed WhatsApp payload', () => {
    const payload = makeTextPayload('wamid.v001', 'test');
    expect(isValidWebhookPayload(payload)).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidWebhookPayload(null)).toBe(false);
  });

  it('rejects a string', () => {
    expect(isValidWebhookPayload('hello')).toBe(false);
  });

  it('rejects an object missing required fields', () => {
    expect(isValidWebhookPayload({ foo: 'bar' })).toBe(false);
  });
});
