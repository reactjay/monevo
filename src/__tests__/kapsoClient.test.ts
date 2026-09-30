import axios, { AxiosError } from 'axios';
import { sendTextMessage, uploadMedia, getMediaInfo, downloadWhatsAppAudio, WhatsAppApiError } from '../services/whatsapp/client';

jest.mock('axios');
jest.mock('../config/env', () => ({
  env: {
    KAPSO_API_KEY: 'kapso_test_key_abc123',
    KAPSO_API_BASE_URL: 'https://api.kapso.ai',
    META_WHATSAPP_PHONE_NUMBER_ID: '1284505108085241',
    META_GRAPH_API_VERSION: 'v24.0',
    META_WHATSAPP_ACCESS_TOKEN: undefined,
  },
}));
jest.mock('../utils/logger', () => ({
  logOutbound: jest.fn(),
}));

const mockedAxios = jest.mocked(axios);

describe('Kapso WhatsApp Client Proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.isAxiosError.mockImplementation(
      (val): val is AxiosError => !!(val && typeof val === 'object' && (val as Record<string, unknown>).isAxiosError === true)
    );
  });

  it('routes sendTextMessage through Kapso Meta proxy with X-API-Key', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { messages: [{ id: 'wamid.kapso_sent' }] } });

    await sendTextMessage('2348100000001', 'Hello via Kapso');

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const [url, payload, options] = mockedAxios.post.mock.calls[0];

    expect(url).toBe('https://api.kapso.ai/meta/whatsapp/v24.0/1284505108085241/messages');
    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      to: '2348100000001',
      text: { body: 'Hello via Kapso' },
    });
    expect(options?.headers).toMatchObject({
      'X-API-Key': 'kapso_test_key_abc123',
      'Content-Type': 'application/json',
    });
  });

  it('routes uploadMedia with X-API-Key and correct endpoint', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'media_uploaded_123' } });

    const buffer = Buffer.from('fake image data');
    const mediaId = await uploadMedia(buffer, 'image/jpeg', 'receipt.jpg');

    expect(mediaId).toBe('media_uploaded_123');
    const [url, , options] = mockedAxios.post.mock.calls[0];
    expect(url).toBe('https://api.kapso.ai/meta/whatsapp/v24.0/1284505108085241/media');
    expect(options?.headers).toMatchObject({
      'X-API-Key': 'kapso_test_key_abc123',
    });
  });

  it('includes phone_number_id in getMediaInfo query for Kapso proxy', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        url: 'https://api.kapso.ai/media/download_abc',
        mime_type: 'audio/ogg',
        file_size: 1024,
        id: 'media_audio_001',
      },
    });

    const info = await getMediaInfo('media_audio_001');

    expect(info.url).toBe('https://api.kapso.ai/media/download_abc');
    expect(info.id).toBe('media_audio_001');
    const [url, options] = mockedAxios.get.mock.calls[0];
    expect(url).toBe('https://api.kapso.ai/meta/whatsapp/v24.0/media_audio_001?phone_number_id=1284505108085241');
    expect(options?.headers).toMatchObject({
      'X-API-Key': 'kapso_test_key_abc123',
    });
  });

  it('passes X-API-Key when downloading audio from Kapso domain', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          url: 'https://api.kapso.ai/media/download_abc',
          mime_type: 'audio/ogg',
          file_size: 1024,
          id: 'media_audio_001',
        },
      })
      .mockResolvedValueOnce({
        data: Buffer.from('audio binary data'),
      });

    const audio = await downloadWhatsAppAudio('media_audio_001');

    expect(audio.mimeType).toBe('audio/ogg');
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);

    const [downloadUrl, downloadOptions] = mockedAxios.get.mock.calls[1];
    expect(downloadUrl).toBe('https://api.kapso.ai/media/download_abc');
    expect(downloadOptions?.headers).toMatchObject({
      'X-API-Key': 'kapso_test_key_abc123',
    });
  });

  it('redacts KAPSO_API_KEY from error messages', async () => {
    mockedAxios.post.mockRejectedValueOnce(
      new Error('Request failed with key kapso_test_key_abc123 exposed')
    );

    let thrown: unknown;
    try {
      await sendTextMessage('2348100000001', 'Test');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(WhatsAppApiError);
    expect((thrown as WhatsAppApiError).message).not.toContain('kapso_test_key_abc123');
    expect((thrown as WhatsAppApiError).message).toContain('[REDACTED]');
  });
});
