import { ParsedMessage } from '../types/whatsapp';
import { handleTextMessage } from '../handlers/textHandler';
import { handleAudioMessage } from '../handlers/audioHandler';

export async function routeMessage(message: ParsedMessage): Promise<void> {
  switch (message.type) {
    case 'text':
      await handleTextMessage(message);
      break;
    case 'audio':
      await handleAudioMessage(message);
      break;
    default:
      // unsupported types are silently ignored
      break;
  }
}
