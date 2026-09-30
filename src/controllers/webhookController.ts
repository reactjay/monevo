import { Request, Response } from 'express';
import crypto from 'crypto';
import { env } from '../config/env';
import { parseWebhookMessage, isValidWebhookPayload } from '../services/whatsapp/messageParser';
import { routeMessage } from '../services/messageRouter';
import { isMessageProcessed, markMessageProcessed } from '../utils/idempotency';
import { logMessageReceived, logMessageProcessed, logMessageError } from '../utils/logger';
import { WhatsAppWebhookPayload, KapsoWebhookPayload, ParsedMessage } from '../types/whatsapp';

/**
 * Validates a Kapso HMAC-SHA256 signature if configured.
 */
export function verifyKapsoSignature(secret: string, body: unknown, signatureHeader?: string | string[]): boolean {
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;
  try {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const sigBuf = Buffer.from(signatureHeader.trim().toLowerCase());
    const expBuf = Buffer.from(expected.toLowerCase());
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

/**
 * GET /webhook/whatsapp
 * Meta calls this once when you configure the webhook URL in the developer dashboard.
 * We must echo back hub.challenge if the token matches.
 */
export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!mode || !token) {
    res.status(400).json({ status: 'error', message: 'Missing hub parameters' });
    return;
  }

  if (mode === 'subscribe' && token === env.META_WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    res.status(200).send(challenge);
    return;
  }

  console.warn('⚠️  Webhook verification failed — token mismatch or wrong mode');
  res.status(403).json({ status: 'error', message: 'Forbidden' });
}

/**
 * POST /webhook/whatsapp
 * Meta and Kapso send incoming messages here.
 * MUST always return 200 — any other status triggers a retry.
 */
export async function handleIncomingMessage(req: Request, res: Response): Promise<void> {
  const receivedAt = Date.now();
  let parsed: ParsedMessage | null = null;

  try {
    const body: unknown = req.body;

    // Optional Kapso signature check if configured
    const kapsoSig = req.headers['x-webhook-signature'];
    if (env.KAPSO_WEBHOOK_SECRET && kapsoSig) {
      if (!verifyKapsoSignature(env.KAPSO_WEBHOOK_SECRET, body, kapsoSig)) {
        console.warn('⚠️  Kapso webhook signature verification failed');
        res.status(401).json({ status: 'error', message: 'Invalid signature' });
        return;
      }
    }

    if (!isValidWebhookPayload(body)) {
      console.warn('Webhook: received non-WhatsApp payload, ignoring');
      res.status(200).json({ status: 'ok' });
      return;
    }

    const bodyObj = body as unknown as Record<string, unknown>;

    // Meta status logging
    const entry = Array.isArray(bodyObj?.entry) ? (bodyObj.entry[0] as Record<string, unknown>) : null;
    const changes = Array.isArray(entry?.changes) ? (entry.changes[0] as Record<string, unknown>) : null;
    const val = changes?.value as Record<string, unknown> | undefined;
    if (Array.isArray(val?.statuses) && val.statuses.length > 0) {
      const st = val.statuses[0] as Record<string, unknown>;
      console.log(`[STATUS] id=${st.id} recipient=${st.recipient_id} status=${st.status} ${st.errors ? 'errors=' + JSON.stringify(st.errors) : ''}`);
    }

    // Kapso status logging
    if (bodyObj?.message && typeof bodyObj.message === 'object') {
      const kMsg = (bodyObj.message as Record<string, unknown>).kapso as Record<string, unknown> | undefined;
      if (Array.isArray(kMsg?.statuses) && kMsg.statuses.length > 0) {
        const st = kMsg.statuses[0] as Record<string, unknown>;
        console.log(`[STATUS] id=${st.id} recipient=${st.recipient_id} status=${st.status} ${st.errors ? 'errors=' + JSON.stringify(st.errors) : ''}`);
      }
    }

    parsed = parseWebhookMessage(body as WhatsAppWebhookPayload | KapsoWebhookPayload);
    if (!parsed) {
      // Status update or other non-message event — not logged as a message
      res.status(200).json({ status: 'ok' });
      return;
    }

    logMessageReceived({
      messageId: parsed.messageId,
      senderId: parsed.senderId,
      messageType: parsed.type,
    });

    const alreadyProcessed = await isMessageProcessed(parsed.messageId);
    if (alreadyProcessed) {
      logMessageProcessed({
        messageId: parsed.messageId,
        senderId: parsed.senderId,
        messageType: parsed.type,
        durationMs: Date.now() - receivedAt,
        status: 'duplicate',
      });
      res.status(200).json({ status: 'ok' });
      return;
    }

    await routeMessage(parsed);
    markMessageProcessed(parsed.messageId);

    logMessageProcessed({
      messageId: parsed.messageId,
      senderId: parsed.senderId,
      messageType: parsed.type,
      durationMs: Date.now() - receivedAt,
      status: 'ok',
    });

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    // Never allow errors to bubble past this point — Meta must always get 200
    const durationMs = Date.now() - receivedAt;
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (parsed) {
      logMessageError({
        messageId: parsed.messageId,
        senderId: parsed.senderId,
        messageType: parsed.type,
        error: errorMsg,
      });
      logMessageProcessed({
        messageId: parsed.messageId,
        senderId: parsed.senderId,
        messageType: parsed.type,
        durationMs,
        status: 'error',
      });
    } else {
      console.error('Webhook processing error:', errorMsg);
    }

    if (!res.headersSent) {
      res.status(200).json({ status: 'ok' });
    }
  }
}
