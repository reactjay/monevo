import { routeMessage } from '../services/messageRouter';
import { handleTextMessage } from '../handlers/textHandler';
import { handleAudioMessage } from '../handlers/audioHandler';
import { ParsedMessage } from '../types/whatsapp';

jest.mock('../handlers/textHandler', () => ({
  handleTextMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../handlers/audioHandler', () => ({
  handleAudioMessage: jest.fn().mockResolvedValue(undefined),
}));

const mockedTextHandler = jest.mocked(handleTextMessage);
const mockedAudioHandler = jest.mocked(handleAudioMessage);

function makeMessage(type: ParsedMessage['type'], extra: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    senderId: '2348100000001',
    messageId: 'msg_001',
    type,
    timestamp: new Date(),
    ...extra,
  };
}

afterEach(() => jest.clearAllMocks());

describe('routeMessage', () => {
  it('routes text messages to handleTextMessage', async () => {
    const msg = makeMessage('text', { text: 'Hello' });
    await routeMessage(msg);
    expect(mockedTextHandler).toHaveBeenCalledTimes(1);
    expect(mockedTextHandler).toHaveBeenCalledWith(msg);
    expect(mockedAudioHandler).not.toHaveBeenCalled();
  });

  it('routes audio messages to handleAudioMessage', async () => {
    const msg = makeMessage('audio', { audioMediaId: 'media_001' });
    await routeMessage(msg);
    expect(mockedAudioHandler).toHaveBeenCalledTimes(1);
    expect(mockedAudioHandler).toHaveBeenCalledWith(msg);
    expect(mockedTextHandler).not.toHaveBeenCalled();
  });

  it('silently ignores unsupported message types', async () => {
    const msg = makeMessage('unsupported');
    await expect(routeMessage(msg)).resolves.not.toThrow();
    expect(mockedTextHandler).not.toHaveBeenCalled();
    expect(mockedAudioHandler).not.toHaveBeenCalled();
  });
});
