// ── Incoming webhook payload shapes from Meta WhatsApp Cloud API ──

export interface WhatsAppTextContent {
  body: string;
}

export interface WhatsAppAudioContent {
  id: string;
  mime_type: string;
}

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'audio' | 'image' | 'video' | 'document' | 'sticker' | 'location' | 'reaction';
  text?: WhatsAppTextContent;
  audio?: WhatsAppAudioContent;
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
}

export interface WhatsAppMetadata {
  display_phone_number: string;
  phone_number_id: string;
}

export interface WhatsAppChangeValue {
  messaging_product: 'whatsapp';
  metadata: WhatsAppMetadata;
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppChange {
  value: WhatsAppChangeValue;
  field: string;
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

// ── Incoming webhook payload shapes from Kapso ──────────────

export interface KapsoMessagePayload {
  id: string;
  timestamp: string | number;
  type: string;
  from?: string;
  text?: { body: string };
  audio?: { id: string; mime_type?: string };
  kapso?: {
    direction?: 'inbound' | 'outbound' | string;
    status?: string;
    processing_status?: string;
    content?: string;
    has_media?: boolean;
    transcript?: { text: string };
    media_url?: string;
    media_data?: {
      url: string;
      filename: string;
      content_type: string;
      byte_size: number;
    };
  };
}

export interface KapsoConversationPayload {
  id?: string;
  phone_number?: string;
  status?: string;
  phone_number_id?: string;
  kapso?: {
    contact_name?: string;
  };
}

export interface KapsoWebhookPayload {
  message?: KapsoMessagePayload;
  conversation?: KapsoConversationPayload;
  contact?: {
    profile_name?: string;
    wa_id?: string;
  };
  event?: string;
  phone_number_id?: string;
  is_new_conversation?: boolean;
}

// ── Parsed / normalised message (internal representation) ────

export type ParsedMessageType = 'text' | 'audio' | 'unsupported';

export interface ParsedMessage {
  senderId: string;
  senderName?: string;
  messageId: string;
  type: ParsedMessageType;
  timestamp: Date;
  text?: string;
  audioMediaId?: string;
}

// ── WhatsApp send-message request shapes ─────────────────────

export interface SendTextRequest {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'text';
  text: { body: string; preview_url?: boolean };
}

export interface SendMediaRequest {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'image' | 'audio' | 'document';
  image?: { id: string; caption?: string };
  audio?: { id: string };
  document?: { id: string; filename?: string };
}
