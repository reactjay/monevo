import axios, { AxiosError } from 'axios';
import { sendTextMessage, WhatsAppApiError } from '../services/whatsapp/client';

jest.mock('axios');
jest.mock('../config/env', () => ({
  env: {
    META_WHATSAPP_ACCESS_TOKEN: 'test-access-token',
    META_WHATSAPP_PHONE_NUMBER_ID: 'test-phone-id',
    META_GRAPH_API_VERSION: 'v19.0',
  },
}));
jest.mock('../utils/logger', () => ({
  logOutbound: jest.fn(),
}));

const mockedAxios = jest.mocked(axios);

/** Mirror real axios behaviour: check err.isAxiosError === true. */
function setupIsAxiosError(): void {
  mockedAxios.isAxiosError.mockImplementation(
    (val): val is AxiosError => !!(val && typeof val === 'object' && (val as Record<string, unknown>).isAxiosError === true)
  );
}

/** Build a minimal error object that isAxiosError() recognises. */
function makeAxiosError(opts: {
  code?: string;
  status?: number;
  data?: unknown;
}): AxiosError {
  const err = new Error('Axios error') as AxiosError;
  err.isAxiosError = true;
  err.code = opts.code;
  err.response = opts.status
    ? ({ status: opts.status, data: opts.data } as AxiosError['response'])
    : undefined;
  return err;
}

beforeEach(() => setupIsAxiosError());
afterEach(() => jest.clearAllMocks());

describe('sendTextMessage', () => {
  it('resolves when the API returns a successful response', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { messages: [{ id: 'wamid.abc' }] } });
    await expect(sendTextMessage('2348100000001', 'Hello')).resolves.toBeUndefined();
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
  });

  it('includes a 10-second timeout in the request', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { messages: [{ id: 'wamid.001' }] } });
    await sendTextMessage('2348100000001', 'Hello');

    const callArgs = mockedAxios.post.mock.calls[0];
    expect(callArgs[2]).toMatchObject({ timeout: 10_000 });
  });

  it('throws WhatsAppApiError on request timeout (ECONNABORTED)', async () => {
    mockedAxios.post.mockRejectedValueOnce(makeAxiosError({ code: 'ECONNABORTED' }));

    let thrown: unknown;
    try {
      await sendTextMessage('2348100000001', 'Hello');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(WhatsAppApiError);
    expect((thrown as WhatsAppApiError).message).toContain('timed out');
  });

  it('throws WhatsAppApiError on HTTP 401, extracting Meta error details', async () => {
    mockedAxios.post.mockRejectedValueOnce(
      makeAxiosError({
        status: 401,
        data: { error: { message: 'Invalid OAuth access token', code: 190, type: 'OAuthException' } },
      })
    );

    let thrown: unknown;
    try {
      await sendTextMessage('2348100000001', 'Hello');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(WhatsAppApiError);
    const waErr = thrown as WhatsAppApiError;
    expect(waErr.message).toBe('Invalid OAuth access token');
    expect(waErr.code).toBe(190);
    expect(waErr.type).toBe('OAuthException');
    // The error message must never contain the real access token
    expect(waErr.message).not.toContain('test-access-token');
  });

  it('throws WhatsAppApiError when Meta returns HTTP 200 with an error body', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        error: {
          message: 'Message failed to send: recipient not registered',
          code: 131026,
          type: 'OAuthException',
        },
      },
    });

    let thrown: unknown;
    try {
      await sendTextMessage('2348100000001', 'Hello');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(WhatsAppApiError);
    expect((thrown as WhatsAppApiError).message).toContain('Message failed to send');
    expect((thrown as WhatsAppApiError).code).toBe(131026);
  });

  it('throws WhatsAppApiError on malformed response without messages', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: {} });

    await expect(sendTextMessage('2348100000001', 'Hello')).rejects.toThrow(
      'Received malformed response from WhatsApp API'
    );
  });

  it('throws WhatsAppApiError with HTTP status when response has no Meta error body', async () => {
    mockedAxios.post.mockRejectedValueOnce(makeAxiosError({ status: 503, data: {} }));

    await expect(sendTextMessage('2348100000001', 'Hello')).rejects.toThrow(
      'HTTP 503'
    );
  });

  it('never logs or leaks access token in error message', async () => {
    mockedAxios.post.mockRejectedValueOnce(
      new Error('Failed with token test-access-token included')
    );

    let thrown: unknown;
    try {
      await sendTextMessage('2348100000001', 'Hello');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(WhatsAppApiError);
    expect((thrown as WhatsAppApiError).message).not.toContain('test-access-token');
    expect((thrown as WhatsAppApiError).message).toContain('[REDACTED]');
  });
});
