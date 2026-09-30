import { AssemblyAI } from 'assemblyai';
import { env } from '../../config/env';

export interface TranscriptionResult {
  transcript: string;
  confidence?: number;
}

export class AssemblyAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssemblyAIError';
  }
}

// WhatsApp commonly delivers audio in these MIME formats
const SUPPORTED_AUDIO_MIME_PREFIXES = [
  'audio/ogg',
  'audio/opus',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/amr',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
];

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

let clientInstance: AssemblyAI | null = null;

export function getAssemblyAIClient(): AssemblyAI {
  if (!clientInstance) {
    const apiKey = env.ASSEMBLYAI_API_KEY;
    if (!apiKey) {
      throw new AssemblyAIError('ASSEMBLYAI_API_KEY is not configured in environment');
    }
    clientInstance = new AssemblyAI({ apiKey });
  }
  return clientInstance;
}

/** For testing: allows resetting or mocking client instance */
export function setAssemblyAIClient(client: AssemblyAI | null): void {
  clientInstance = client;
}

export function isSupportedAudioFormat(mimeType?: string): boolean {
  if (!mimeType) return true;
  const cleanMime = mimeType.toLowerCase().split(';')[0].trim();
  return SUPPORTED_AUDIO_MIME_PREFIXES.some(
    (supported) => cleanMime === supported || mimeType.toLowerCase().startsWith(supported)
  );
}

/**
 * Transcribes an audio buffer using AssemblyAI SDK.
 * Synchronously waits for the transcript result for fast voice notes.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  mimeType?: string
): Promise<TranscriptionResult> {
  // 1. Validation & limits
  if (!audioBuffer || audioBuffer.length === 0) {
    throw new AssemblyAIError('Audio buffer is empty');
  }

  if (audioBuffer.length > MAX_AUDIO_SIZE_BYTES) {
    throw new AssemblyAIError(
      `Audio size (${Math.round(audioBuffer.length / (1024 * 1024))}MB) exceeds maximum limit of 25MB`
    );
  }

  if (mimeType && !isSupportedAudioFormat(mimeType)) {
    throw new AssemblyAIError(`Unsupported audio MIME type: ${mimeType}`);
  }

  try {
    const client = getAssemblyAIClient();

    // AssemblyAI transcribe with universal flagship models, word_boost high, and fintech contextual prompts
    const transcriptResponse = await client.transcripts.transcribe({
      audio: audioBuffer,
      speech_models: ['universal-3-5-pro', 'universal-2'],
      language_detection: true,
      boost_param: 'high',
      word_boost: [
        'Monevo',
        'monevo',
        'Naira',
        'kobo',
        'NGN',
        'k',
        'hundred',
        'thousand',
        'million',
        'billion',
        'spending analytics',
        'weekly analytics',
        'analytics',
        'my balance',
        'balance',
        'deep freezer',
        'freezer',
        'generator',
        'fuel',
        'petrol',
        'groceries',
        'food',
        'suya',
        'shawarma',
        'transport',
        'danfo',
        'keke',
        'light bill',
        'nepa',
        'phcn',
        'salary',
        'freelance',
        'pos',
        'POS',
        'receipt',
        'invoice',
        'spent',
        'spend',
        'bought',
        'buy',
        'purchase',
        'received',
        'transfer',
        'transferred',
        'report',
        'summary',
        'David',
        'Sarah',
        'Dangote',
      ],
      prompt:
        'User recording a voice note on WhatsApp with financial transactions in Nigerian English, stating expenses, income, Nigerian Naira amounts, spending analytics, receipts, or balance inquiries for Monevo AI assistant.',
      keyterms_prompt: [
        'Monevo',
        'Naira',
        'kobo',
        'k',
        'hundred',
        'thousand',
        'million',
        'spending analytics',
        'weekly analytics',
        'analytics',
        'balance',
        'my balance',
        'deep freezer',
        'generator',
        'fuel',
        'petrol',
        'groceries',
        'food',
        'suya',
        'shawarma',
        'transport',
        'danfo',
        'keke',
        'light bill',
        'nepa',
        'phcn',
        'salary',
        'freelance',
        'pos',
        'receipt',
        'invoice',
        'spent',
        'bought',
        'received',
        'transfer',
        'report',
      ],
      punctuate: true,
      format_text: true,
    });

    if (transcriptResponse.status === 'error') {
      throw new AssemblyAIError(
        transcriptResponse.error || 'AssemblyAI transcription failed'
      );
    }

    const transcriptText = (transcriptResponse.text ?? '').trim();
    const confidence = transcriptResponse.confidence ?? undefined;

    return {
      transcript: transcriptText,
      confidence,
    };
  } catch (err) {
    if (err instanceof AssemblyAIError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    const sanitized = env.ASSEMBLYAI_API_KEY
      ? message.split(env.ASSEMBLYAI_API_KEY).join('[REDACTED]')
      : message;
    throw new AssemblyAIError(`AssemblyAI transcription error: ${sanitized}`);
  }
}
