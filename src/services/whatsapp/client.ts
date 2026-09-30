import axios from 'axios';
import { env } from '../../config/env';
import { SendTextRequest } from '../../types/whatsapp';
import { logOutbound } from '../../utils/logger';

const SEND_TIMEOUT_MS = 10_000;

/** Structured error returned by the Meta Graph API. */
interface MetaApiError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

/** Thrown whenever the WhatsApp send fails — never contains credentials. */
export class WhatsAppApiError extends Error {
  readonly code?: number;
  readonly type?: string;

  constructor(message: string, code?: number, type?: string) {
    super(message);
    this.name = 'WhatsAppApiError';
    this.code = code;
    this.type = type;
  }
}

function getApiBase(): string {
  if (env.KAPSO_API_KEY) {
    const base = env.KAPSO_API_BASE_URL.replace(/\/+$/, '');
    return `${base}/meta/whatsapp/${env.META_GRAPH_API_VERSION}`;
  }
  return `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}`;
}

function getAuthHeaders(): Record<string, string> {
  if (env.KAPSO_API_KEY) {
    return {
      'X-API-Key': env.KAPSO_API_KEY,
      'Content-Type': 'application/json',
    };
  }
  return {
    Authorization: `Bearer ${env.META_WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

function extractMetaError(data: unknown): MetaApiError | undefined {
  if (data && typeof data === 'object' && 'error' in data) {
    return (data as { error: MetaApiError }).error;
  }
  return undefined;
}

function sanitizeErrorMessage(msg: string): string {
  if (!msg) return msg;
  let sanitized = msg;
  if (env.META_WHATSAPP_ACCESS_TOKEN) {
    sanitized = sanitized.split(env.META_WHATSAPP_ACCESS_TOKEN).join('[REDACTED]');
  }
  if (env.KAPSO_API_KEY) {
    sanitized = sanitized.split(env.KAPSO_API_KEY).join('[REDACTED]');
  }
  return sanitized;
}

function toWhatsAppApiError(err: unknown): never {
  if (err instanceof WhatsAppApiError) throw err;

  if (axios.isAxiosError(err)) {
    if (
      err.code === 'ECONNABORTED' ||
      err.code === 'ETIMEDOUT' ||
      err.message?.toLowerCase().includes('timeout')
    ) {
      throw new WhatsAppApiError(`WhatsApp API request timed out after ${SEND_TIMEOUT_MS}ms`);
    }

    const metaErr = extractMetaError(err.response?.data);
    if (metaErr) {
      throw new WhatsAppApiError(
        sanitizeErrorMessage(metaErr.message ?? 'Meta API error'),
        metaErr.code,
        metaErr.type
      );
    }

    const status = err.response?.status ? `HTTP ${err.response.status}` : 'Network Error';
    throw new WhatsAppApiError(`WhatsApp API request failed (${status})`);
  }

  const raw = err instanceof Error ? err.message : String(err);
  throw new WhatsAppApiError(sanitizeErrorMessage(`WhatsApp API error: ${raw}`));
}

import { cleanWhatsAppFormatting } from '../../utils/whatsappFormatter';

export async function sendTextMessage(to: string, body: string): Promise<void> {
  logOutbound(to, 'text');

  const cleanedBody = cleanWhatsAppFormatting(body);

  const url = `${getApiBase()}/${env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload: SendTextRequest = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: cleanedBody },
  };

  try {
    const response = await axios.post<{ messages?: unknown[]; error?: MetaApiError }>(
      url,
      payload,
      { headers: getAuthHeaders(), timeout: SEND_TIMEOUT_MS }
    );

    // Meta occasionally returns 200 with an error body
    const metaErr = extractMetaError(response.data);
    if (metaErr) {
      throw new WhatsAppApiError(
        sanitizeErrorMessage(metaErr.message ?? 'Meta API error'),
        metaErr.code,
        metaErr.type
      );
    }

    // Handle malformed responses: successful responses must contain a non-empty messages array
    if (
      !response.data ||
      typeof response.data !== 'object' ||
      !Array.isArray(response.data.messages) ||
      response.data.messages.length === 0
    ) {
      throw new WhatsAppApiError('Received malformed response from WhatsApp API');
    }
  } catch (err) {
    toWhatsAppApiError(err);
  }
}

export async function sendImageMessage(
  to: string,
  mediaId: string,
  caption?: string
): Promise<void> {
  logOutbound(to, 'image');

  const url = `${getApiBase()}/${env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'image',
        image: { id: mediaId, ...(caption ? { caption } : {}) },
      },
      { headers: getAuthHeaders(), timeout: SEND_TIMEOUT_MS }
    );
  } catch (err) {
    toWhatsAppApiError(err);
  }
}

export async function sendAudioMessage(to: string, mediaId: string): Promise<void> {
  logOutbound(to, 'audio');

  const url = `${getApiBase()}/${env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'audio',
        audio: { id: mediaId },
      },
      { headers: getAuthHeaders(), timeout: SEND_TIMEOUT_MS }
    );
  } catch (err) {
    toWhatsAppApiError(err);
  }
}

export async function uploadMedia(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const url = `${getApiBase()}/${env.META_WHATSAPP_PHONE_NUMBER_ID}/media`;

  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('file', buffer, { filename, contentType: mimeType });
  form.append('type', mimeType);

  const authHeaders = getAuthHeaders();
  delete authHeaders['Content-Type'];

  try {
    const response = await axios.post<{ id: string }>(url, form, {
      headers: {
        ...authHeaders,
        ...form.getHeaders(),
      },
      timeout: 30_000,
    });
    return response.data.id;
  } catch (err) {
    toWhatsAppApiError(err);
  }
}

export interface WhatsAppMediaInfo {
  url: string;
  mimeType: string;
  fileSize?: number;
  id: string;
}

export async function getMediaInfo(mediaId: string): Promise<WhatsAppMediaInfo> {
  const query = env.KAPSO_API_KEY && env.META_WHATSAPP_PHONE_NUMBER_ID
    ? `?phone_number_id=${env.META_WHATSAPP_PHONE_NUMBER_ID}`
    : '';
  const url = `${getApiBase()}/${mediaId}${query}`;

  try {
    const response = await axios.get<{
      url?: string;
      mime_type?: string;
      file_size?: number;
      id?: string;
      error?: MetaApiError;
    }>(url, {
      headers: getAuthHeaders(),
      timeout: SEND_TIMEOUT_MS,
    });

    const metaErr = extractMetaError(response.data);
    if (metaErr) {
      throw new WhatsAppApiError(
        sanitizeErrorMessage(metaErr.message ?? 'Meta API error'),
        metaErr.code,
        metaErr.type
      );
    }

    if (!response.data || !response.data.url) {
      throw new WhatsAppApiError('Failed to retrieve media URL from Meta API');
    }

    return {
      url: response.data.url,
      mimeType: response.data.mime_type || 'audio/ogg',
      fileSize: response.data.file_size,
      id: response.data.id || mediaId,
    };
  } catch (err) {
    toWhatsAppApiError(err);
  }
}

export async function downloadWhatsAppAudio(
  mediaId: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const mediaInfo = await getMediaInfo(mediaId);

  const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
  if (mediaInfo.fileSize && mediaInfo.fileSize > MAX_AUDIO_BYTES) {
    throw new WhatsAppApiError(`Audio file size (${mediaInfo.fileSize} bytes) exceeds 25MB limit`);
  }

  try {
    const downloadHeaders: Record<string, string> = {};
    if (mediaInfo.url.includes('kapso.ai') && env.KAPSO_API_KEY) {
      downloadHeaders['X-API-Key'] = env.KAPSO_API_KEY;
    } else if (env.META_WHATSAPP_ACCESS_TOKEN) {
      downloadHeaders['Authorization'] = `Bearer ${env.META_WHATSAPP_ACCESS_TOKEN}`;
    }

    const response = await axios.get<ArrayBuffer>(mediaInfo.url, {
      headers: downloadHeaders,
      responseType: 'arraybuffer',
      timeout: 30_000,
    });

    const rawData = response.data;
    const buffer = Buffer.isBuffer(rawData)
      ? rawData
      : Buffer.from(rawData);
    if (buffer.length === 0) {
      throw new WhatsAppApiError('Downloaded audio buffer is empty');
    }

    if (buffer.length > MAX_AUDIO_BYTES) {
      throw new WhatsAppApiError(`Audio file size (${buffer.length} bytes) exceeds 25MB limit`);
    }

    return {
      buffer,
      mimeType: mediaInfo.mimeType,
    };
  } catch (err) {
    toWhatsAppApiError(err);
  }
}
