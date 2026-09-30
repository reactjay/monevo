import { WhatsAppWebhookPayload } from '../../types/whatsapp';

export const SENDER_ID = '2348100000001';
export const PHONE_NUMBER_ID = 'test_phone_number_id';

export function makeTextPayload(
  messageId: string,
  text: string,
  senderId: string = SENDER_ID
): WhatsAppWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'test_waba_id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ profile: { name: 'Test User' }, wa_id: senderId }],
              messages: [
                {
                  from: senderId,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function makeAudioPayload(
  messageId: string,
  mediaId: string,
  senderId: string = SENDER_ID
): WhatsAppWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'test_waba_id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: PHONE_NUMBER_ID,
              },
              contacts: [{ profile: { name: 'Voice User' }, wa_id: senderId }],
              messages: [
                {
                  from: senderId,
                  id: messageId,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: 'audio',
                  audio: { id: mediaId, mime_type: 'audio/ogg; codecs=opus' },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function makeStatusPayload(messageId: string): WhatsAppWebhookPayload {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'test_waba_id',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '1234567890',
                phone_number_id: PHONE_NUMBER_ID,
              },
              statuses: [
                {
                  id: messageId,
                  status: 'delivered',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: SENDER_ID,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
