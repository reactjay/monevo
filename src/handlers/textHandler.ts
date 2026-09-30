import { ParsedMessage } from '../types/whatsapp';
import { sendTextMessage } from '../services/whatsapp/client';
import { handleOnboarding } from '../services/onboarding/onboardingService';
import { extractIntent } from '../services/ai/intentExtractor';
import { dispatchIntent } from '../services/tools/toolDispatcher';
import { handleClarificationResponse } from '../services/clarification/clarificationService';
import { sendUserResponse } from '../services/tts/ttsService';
import { generateInteractiveResponseWithGroq, isGroqConfigured } from '../services/ai/groqService';
import { User } from '../models/User';

export const WELCOME_MESSAGE =
  "Hello! 👋 I'm *Monevo*, your WhatsApp AI financial assistant.\n\nI can help you track expenses, record income, generate digital receipts, and view weekly visual reports.\n\nTry sending:\n• _\"Spent 5,000 on fuel\"_\n• _\"Create a receipt for David 150,000\"_\n• _\"Show my weekly analytics\"_";

export async function handleTextMessage(message: ParsedMessage): Promise<void> {
  const handledByOnboarding = await handleOnboarding(message);
  if (handledByOnboarding) {
    return;
  }

  // Retrieve onboarded user
  const user = await User.findOne({ whatsappId: message.senderId });
  if (!user) {
    await sendTextMessage(message.senderId, WELCOME_MESSAGE);
    return;
  }

  // Auto-sync WhatsApp profile name if user name is not yet set
  if (message.senderName && !user.name) {
    user.name = message.senderName;
    try {
      await User.updateOne({ _id: user._id }, { name: message.senderName });
    } catch {
      // Ignore in mock/isolated environments
    }
  }

  const effectiveUserName = user.name || message.senderName;

  // 1. Check if user is responding to an active clarification request
  const clarificationReply = await handleClarificationResponse(user, message.text || '', {
    user,
    source: 'text',
    whatsappMessageId: message.messageId,
  });

  if (clarificationReply) {
    const finalReply = isGroqConfigured()
      ? await generateInteractiveResponseWithGroq({
          userName: effectiveUserName,
          userMessage: message.text || '',
          toolResultText: clarificationReply,
        })
      : clarificationReply;

    await sendUserResponse(user, finalReply);
    return;
  }

  // 2. AI Intent Extraction
  const intent = await extractIntent(message.text || '', {
    defaultCurrency: user.currency || 'NGN',
    userName: effectiveUserName,
  });

  // 3. Execute Financial Tool & Generate WhatsApp Response
  const responseText = await dispatchIntent(intent, {
    user,
    source: 'text',
    whatsappMessageId: message.messageId,
  });

  // 4. Generate Interactive, Name-Tuned WhatsApp Response via Groq AI
  const interactiveResponse = isGroqConfigured()
    ? await generateInteractiveResponseWithGroq({
        userName: effectiveUserName,
        userMessage: message.text || '',
        toolResultText: responseText,
        intent,
      })
    : responseText;

  await sendUserResponse(user, interactiveResponse);
}

