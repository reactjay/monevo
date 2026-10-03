import { ParsedMessage } from '../types/whatsapp';
import { sendTextMessage, downloadWhatsAppAudio } from '../services/whatsapp/client';
import { transcribeAudio, TranscriptionResult } from '../services/assemblyai/assemblyai.service';
import {
  transcribeAudioWithGroq,
  generateInteractiveResponseWithGroq,
  isGroqConfigured,
  isFailureOrConfirmationPrompt,
} from '../services/ai/groqService';
import { extractIntent } from '../services/ai/intentExtractor';
import { dispatchIntent } from '../services/tools/toolDispatcher';
import { handleClarificationResponse } from '../services/clarification/clarificationService';
import { sendUserResponse } from '../services/tts/ttsService';
import {
  isModelInfrastructureQuery,
  MONEVO_IDENTITY_RESPONSE,
} from '../services/ai/modelIdentityGuard';
import { User } from '../models/User';

export const NO_AUDIO_MEDIA_MESSAGE =
  'Sorry, no audio media was found in your voice message. Please try sending it again. 🎙️';

export const EMPTY_TRANSCRIPT_MESSAGE =
  "I couldn't hear any words in that voice note. Please try speaking closer to your phone or send a text message. 🎙️";

export const VOICE_PROCESSING_ERROR_MESSAGE =
  'Sorry, I had trouble processing that voice note. Please try again or send a text message. 🎙️';

export function normalizeVoiceTranscript(raw: string): string {
  if (!raw) return raw;
  let normalized = raw;
  // Normalize phonetically misheard Monevo names
  normalized = normalized.replace(/\b(mon niveau|mon niveux|mon niveo|mon evo|mon evan|money vo|moneyvo|mone vo|mon e vo|manevor|maneve)\b/gi, 'Monevo');
  // Normalize disconnected shorthand numbers like "5 k" -> "5k", "150 k" -> "150k"
  normalized = normalized.replace(/\b(\d+)\s+([kKmM])\b/g, '$1$2');
  return normalized.trim();
}

export async function handleAudioMessage(
  message: ParsedMessage
): Promise<TranscriptionResult | void> {
  const mediaId = message.audioMediaId;
  if (!mediaId) {
    await sendTextMessage(message.senderId, NO_AUDIO_MEDIA_MESSAGE);
    return;
  }

  try {
    // 1. Retrieve media URL and download audio buffer
    const { buffer, mimeType } = await downloadWhatsAppAudio(mediaId);

    // 2. Transcribe: Groq Whisper (blazing fast, accent & pidgin tolerant) or AssemblyAI fallback
    let result: TranscriptionResult;
    if (isGroqConfigured()) {
      try {
        const groqResult = await transcribeAudioWithGroq(buffer, mimeType);
        result = { transcript: groqResult.transcript };
      } catch (err) {
        console.warn('[VOICE] Groq Whisper failed, falling back to AssemblyAI:', err instanceof Error ? err.message : err);
        result = await transcribeAudio(buffer, mimeType);
      }
    } else {
      result = await transcribeAudio(buffer, mimeType);
    }

    if (!result.transcript) {
      await sendTextMessage(message.senderId, EMPTY_TRANSCRIPT_MESSAGE);
      return result;
    }

    const cleanTranscript = normalizeVoiceTranscript(result.transcript);
    console.log(`[VOICE:transcribe] from=${message.senderId} raw="${result.transcript}" normalized="${cleanTranscript}"`);

    // 3. Check onboarding or retrieve user
    let user = null;
    try {
      user = await User.findOne({ whatsappId: message.senderId });
    } catch {
      // MongoDB may not be initialized in isolated unit tests
    }

    if (user && user.onboardingComplete) {
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

      // 3a. Model Identity & Anti-Hallucination Guard: deterministic bypass
      if (isModelInfrastructureQuery(cleanTranscript)) {
        await sendUserResponse(user, MONEVO_IDENTITY_RESPONSE, {
          forceVoiceIfAvailable: user.responseMode === 'voice',
        });
        return result;
      }

      // 4. Check if user is responding to an active clarification request via voice
      const clarificationReply = await handleClarificationResponse(user, cleanTranscript, {
        user,
        source: 'voice',
        transcript: cleanTranscript,
        whatsappMessageId: message.messageId,
      });

      if (clarificationReply) {
        console.log(`[VOICE:clarify] to=${user.whatsappId} reply="${clarificationReply}"`);
        const finalReply = isGroqConfigured()
          ? await generateInteractiveResponseWithGroq({
              userName: effectiveUserName,
              userMessage: cleanTranscript,
              toolResultText: clarificationReply,
            })
          : clarificationReply;

        await sendUserResponse(user, finalReply, {
          forceVoiceIfAvailable: user.responseMode === 'voice',
        });
        return result;
      }

      // 5. AI Intent Extraction on transcribed voice
      const intent = await extractIntent(cleanTranscript, {
        defaultCurrency: user.currency || 'NGN',
        userName: effectiveUserName,
      });
      console.log(`[VOICE:intent] intent=${intent.intent} from=${user.whatsappId}`);

      // 6. Execute Financial Tool & reply with natural WhatsApp formatting
      let responseText: string;
      try {
        responseText = await dispatchIntent(intent, {
          user,
          source: 'voice',
          transcript: cleanTranscript,
          whatsappMessageId: message.messageId,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        responseText = `❌ *Transaction Failed*\n\n${errorMsg}\n\nYour balance remains unaltered.`;
      }

      console.log(`[VOICE:reply] to=${user.whatsappId} mode=${user.responseMode || 'text'} reply="${responseText.replace(/\n/g, ' ')}"`);

      // 7. Generate interactive response addressing user warmly
      // Persistence-First Guarantee: Never pass failure messages or confirmation prompts to the LLM
      const finalResponse =
        isGroqConfigured() && !isFailureOrConfirmationPrompt(responseText)
          ? await generateInteractiveResponseWithGroq({
              userName: effectiveUserName,
              userMessage: cleanTranscript,
              toolResultText: responseText,
              intent,
            })
          : responseText;

      await sendUserResponse(user, finalResponse, {
        forceVoiceIfAvailable: user.responseMode === 'voice',
      });
      return result;
    }

    // Fallback: reply with transcript for non-onboarded users
    console.log(`[VOICE:echo] to=${message.senderId} (not onboarded) transcript="${result.transcript}"`);
    await sendTextMessage(message.senderId, result.transcript);
    return result;
  } catch (err) {
    console.error('Audio processing error:', err instanceof Error ? err.message : err);
    await sendTextMessage(message.senderId, VOICE_PROCESSING_ERROR_MESSAGE);
  }
}

