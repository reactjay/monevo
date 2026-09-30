import {
  WhatsAppWebhookPayload,
  KapsoWebhookPayload,
  ParsedMessage,
  ParsedMessageType,
} from '../../types/whatsapp';

/**
 * Checks if payload matches Meta WhatsApp Cloud API webhook format.
 */
export function isMetaWebhookPayload(body: unknown): body is WhatsAppWebhookPayload {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return typeof b['object'] === 'string' && Array.isArray(b['entry']);
}

/**
 * Checks if payload matches Kapso native webhook format (whatsapp.message.*).
 */
export function isKapsoWebhookPayload(body: unknown): body is KapsoWebhookPayload {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b['message'] === 'object' &&
    b['message'] !== null &&
    (typeof b['conversation'] === 'object' ||
      typeof b['phone_number_id'] === 'string' ||
      typeof b['event'] === 'string')
  );
}

/**
 * Validates that an incoming request body is either a Meta or Kapso webhook payload.
 */
export function isValidWebhookPayload(
  body: unknown
): body is WhatsAppWebhookPayload | KapsoWebhookPayload {
  return isMetaWebhookPayload(body) || isKapsoWebhookPayload(body);
}

/**
 * Extracts the first actionable message from a Meta or Kapso webhook payload.
 * Returns null for status updates, empty payloads, or non-message events.
 */
export function parseWebhookMessage(
  payload: WhatsAppWebhookPayload | KapsoWebhookPayload
): ParsedMessage | null {
  // ── Kapso native webhook payload ────────────────────────────
  if (isKapsoWebhookPayload(payload)) {
    const msg = payload.message;
    if (!msg || !msg.id) return null;

    // Ignore outbound messages/echoes
    if (msg.kapso?.direction === 'outbound') return null;

    const rawSender =
      payload.conversation?.phone_number ||
      msg.from ||
      payload.contact?.wa_id;

    if (!rawSender) return null;
    const senderId = rawSender.replace(/^\+/, '');

    const senderName =
      payload.conversation?.kapso?.contact_name ||
      payload.contact?.profile_name;

    let type: ParsedMessageType;
    if (msg.type === 'text') {
      type = 'text';
    } else if (msg.type === 'audio') {
      type = 'audio';
    } else {
      type = 'unsupported';
    }

    const timestampNum = Number(msg.timestamp);
    const timestamp = isNaN(timestampNum)
      ? new Date()
      : new Date(timestampNum > 1e11 ? timestampNum : timestampNum * 1000);

    const parsed: ParsedMessage = {
      senderId,
      senderName,
      messageId: msg.id,
      type,
      timestamp,
    };

    if (type === 'text') {
      parsed.text = msg.text?.body || msg.kapso?.content;
    }

    if (type === 'audio') {
      parsed.audioMediaId =
        msg.audio?.id ||
        msg.kapso?.media_data?.url ||
        msg.kapso?.media_url;
    }

    return parsed;
  }

  // ── Meta WhatsApp Cloud API webhook payload ──────────────────
  if (payload.object !== 'whatsapp_business_account') {
    return null;
  }

  const entry = payload.entry?.[0];
  if (!entry) return null;

  const change = entry.changes?.find((c) => c.field === 'messages');
  if (!change) return null;

  const value = change.value;
  const message = value.messages?.[0];
  if (!message) return null;

  // Ignore status callbacks — they look like messages but have no body
  if (!message.from || !message.id) return null;

  const senderName = value.contacts?.[0]?.profile?.name;

  let type: ParsedMessageType;
  if (message.type === 'text') {
    type = 'text';
  } else if (message.type === 'audio') {
    type = 'audio';
  } else {
    type = 'unsupported';
  }

  const parsed: ParsedMessage = {
    senderId: message.from,
    senderName,
    messageId: message.id,
    type,
    timestamp: new Date(Number(message.timestamp) * 1000),
  };

  if (type === 'text' && message.text?.body) {
    parsed.text = message.text.body;
  }

  if (type === 'audio' && message.audio?.id) {
    parsed.audioMediaId = message.audio.id;
  }

  return parsed;
}
