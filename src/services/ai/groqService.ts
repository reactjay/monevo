import Groq, { toFile } from 'groq-sdk';
import { env } from '../../config/env';
import {
  FinancialIntent,
  FinancialIntentSchema,
} from './schemas';
import { ExtractionOptions } from './intentExtractor';
import { cleanWhatsAppFormatting } from '../../utils/whatsappFormatter';

let groqInstance: Groq | null = null;

export function getGroqClient(): Groq | null {
  if (groqInstance) return groqInstance;
  if (!isGroqConfigured()) return null;
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) return null;
  groqInstance = new Groq({ apiKey });
  return groqInstance;
}

/** For testing/mocking */
export function setGroqClient(client: Groq | null): void {
  groqInstance = client;
}

export const GROQ_LLM_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

export function isGroqConfigured(): boolean {
  if (groqInstance) return true;
  if (process.env.NODE_ENV === 'test') return false;
  return Boolean(env.GROQ_API_KEY && env.GROQ_API_KEY.trim().length > 0);
}

/**
 * Transcribes audio using Groq Whisper-large-v3.
 * Known for exceptional accuracy across diverse accents, Nigerian English, Pidgin, and fast speech.
 */
export async function transcribeAudioWithGroq(
  audioBuffer: Buffer,
  mimeType: string = 'audio/ogg'
): Promise<{ transcript: string }> {
  const client = getGroqClient();
  if (!client) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const extension = mimeType.includes('mp4') || mimeType.includes('m4a')
    ? 'm4a'
    : mimeType.includes('mp3') || mimeType.includes('mpeg')
    ? 'mp3'
    : mimeType.includes('wav')
    ? 'wav'
    : 'ogg';

  const file = await toFile(audioBuffer, `voice_${Date.now()}.${extension}`, {
    type: mimeType,
  });

  const response = await client.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3',
    language: 'en',
    prompt:
      'Voice note for Monevo financial assistant. Nigerian English, Pidgin, and African accents: Naira, kobo, k (thousands), million, fuel, food, transfer, balance, spend, receipt, POS, salary, electricity, shawarma, transport, keke, danfo.',
    temperature: 0.0,
    response_format: 'verbose_json',
  });

  return {
    transcript: (response.text || '').trim(),
  };
}

/**
 * Extracts structured financial intents using Groq Llama 3.3 70B with JSON mode.
 * Understands natural language, slang, Nigerian Pidgin, shorthand, and casual text effortlessly.
 */
export async function extractIntentWithGroq(
  text: string,
  options: ExtractionOptions & { userName?: string } = {}
): Promise<FinancialIntent | null> {
  const client = getGroqClient();
  if (!client) return null;

  const defaultCurrency = options.defaultCurrency || 'NGN';
  const referenceDate = options.referenceDate || new Date();
  const dateStr = referenceDate.toISOString().slice(0, 10);

  const effectiveUserName = options.userName ? options.userName.trim() : 'my friend';

  const systemPrompt = `You are Monevo AI, a fun, warm, intelligent, and culturally fluent WhatsApp financial assistant.
You must return your output strictly in valid JSON format.
Today's date is ${dateStr}.
Default currency is ${defaultCurrency}.
User's name: ${effectiveUserName}.

You effortlessly understand diverse human speech, including:
- Standard British/American English
- Nigerian English, African colloquialisms, and Nigerian Pidgin (e.g., "how far my guy", "how you de?", "wetin dey happen", "I dash am 5k", "I pay 3k for light bill", "David transfer 150k give me", "Wetin be my balance?", "Comot 10k for fuel", "How far with my money?", "E don enter 50k", "Send me weekly breakdown")
- Slang and abbreviations ("5k" = 5000, "1.5m" = 1500000, "200bucks" = 200, "pos", "keke", "danfo", "shawarma", "suya")
- Natural user requests to update their preferred name (e.g. "Call me Jay", "My name is Japheth", "I prefer Alex")

Return a JSON object conforming strictly to ONE of the following schemas:

1. record_transaction:
{
  "intent": "record_transaction",
  "transaction": {
    "type": "income" | "expense",
    "amount": number (positive, e.g. 5000),
    "currency": string (e.g. "${defaultCurrency}"),
    "category": string (e.g. "Food & Dining", "Transportation", "Utilities", "Fuel", "Freelance", "Shopping", "Salary", "General"),
    "description": string (clean summary of the item or reason),
    "counterparty": string or null (person or business paid to / received from),
    "date": "YYYY-MM-DD"
  }
}

2. clarification_required (CRITICAL: If user says they spent or received money but NO amount is given, e.g. "I bought fuel", "David paid me"):
{
  "intent": "clarification_required",
  "missing": ["amount"],
  "clarificationPrompt": "Friendly question addressing ${effectiveUserName} asking for the missing amount for the specific item or person",
  "partial": { "type": "expense" | "income", "category": "...", "description": "...", "counterparty": "..." }
}

3. financial_query:
{
  "intent": "financial_query",
  "queryType": "period_summary" | "category_summary" | "largest_expense" | "balance" | "recent_transactions" | "income_summary" | "category_spend" | "compare_periods" | "weekly_report",
  "period": "today" | "yesterday" | "this_week" | "last_week" | "this_month" | "last_month" | "this_year" | "all_time",
  "comparePeriod": "last_month" | "last_week",
  "category": string (optional, e.g. "food" if asking about food spend)
}

4. generate_receipt:
{
  "intent": "generate_receipt",
  "target": {
    "counterparty": string or null,
    "amount": number or undefined,
    "description": string or undefined
  }
}

5. profile_update:
{
  "intent": "profile_update",
  "fields": {
    "name": string (optional, if user says "Call me Jay" -> "Jay"),
    "currency": string (optional),
    "responseMode": "text" | "voice" (optional)
  }
}

6. help:
{
  "intent": "help"
}

7. conversation (CRITICAL FOR FUN & ENGAGEMENT: If the user is saying hello, greeting, asking how you are, banter, jokes, tips, or chit-chat like "how far my guy", "how you de?", "wetin dey", "who are you?", "good morning"):
{
  "intent": "conversation",
  "reply": "Warm, lively, witty response in natural English/Pidgin addressing ${effectiveUserName} with good vibes, answering their banter playfully, and casually asking if there is any expense, income, or balance to check! STRICT WHATSAPP FORMAT: Use *bold* for titles, _italics_ for quotes/examples, and clean emojis. NEVER use markdown headers (# or ###) or horizontal divider lines (---). Keep it neat, complete, and never cut off mid-sentence."
}

8. unknown:
{
  "intent": "unknown",
  "rawText": "${text.replace(/"/g, '\\"')}"
}

STRICT SAFETY RULES:
- NEVER invent an amount. If amount is not explicitly stated or implied by number, return clarification_required.
- Return ONLY valid JSON format.`;

  try {
    const completion = await client.chat.completions.create({
      model: GROQ_LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 800,
    });

    const rawJson = completion.choices[0]?.message?.content;
    if (!rawJson) return null;

    const parsed = JSON.parse(rawJson);
    const validated = FinancialIntentSchema.safeParse(parsed);
    if (validated.success) {
      if (validated.data.intent === 'conversation') {
        validated.data.reply = cleanWhatsAppFormatting(validated.data.reply);
      }
      return validated.data;
    } else {
      console.warn('[GROQ:intent] Validation fallback:', validated.error.issues);
      return null;
    }
  } catch (err) {
    console.error('[GROQ:intent] Error calling Groq API:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Generates an interactive, personalized WhatsApp message.
 * Addresses the user warmly by their preferred or WhatsApp name, tunes into their tone,
 * and makes the experience engaging and human.
 */
export async function generateInteractiveResponseWithGroq(params: {
  userName?: string;
  userMessage: string;
  toolResultText: string;
  intent?: FinancialIntent;
}): Promise<string> {
  if (params.intent && params.intent.intent === 'conversation') {
    return cleanWhatsAppFormatting(params.intent.reply);
  }

  const client = getGroqClient();
  const preferredName = params.userName ? params.userName.trim() : null;

  // If Groq is not configured or fails, provide a personalized fallback with the user's name
  if (!client) {
    if (preferredName) {
      // Prepend name naturally if not already present
      if (!params.toolResultText.includes(preferredName)) {
        return cleanWhatsAppFormatting(`Hey ${preferredName}! 👋\n\n${params.toolResultText}`);
      }
    }
    return cleanWhatsAppFormatting(params.toolResultText);
  }

  const systemPrompt = `You are Monevo AI, an enthusiastic, culturally fluent WhatsApp financial assistant.
User's Name: ${preferredName ? preferredName : 'Friend'}

Your job is to deliver the final response to the user.
You are given:
1. What the user said
2. The exact financial tool result / confirmation / figures from Monevo backend

RULES:
1. Address the user directly and warmly by their name (${preferredName || 'there'}), making them feel seen and valued.
2. If the user tells you their name or preferred name (e.g. "Call me Japheth"), acknowledge it warmly and confirm you'll call them that!
3. KEEP ALL FINANCIAL FACTS, AMOUNTS, CURRENCIES, AND BALANCES 100% ACCURATE according to the tool result. Do NOT change numbers!
4. Tune your vibe to the user:
   - If they wrote in Pidgin or casual slang, respond with warm, natural energy and slight relatable Naija touch.
   - If they are formal, be crisp, polite, and encouraging.
5. WHATSAPP FORMATTING (CRITICAL - MUST BE NEAT):
   - WhatsApp does NOT support markdown headers (###, ##, #) or horizontal divider lines (---). NEVER USE THEM!
   - Use *single asterisks* for bold titles (e.g. *Title*). Never use double asterisks (**text**).
   - Use _single underscores_ for italics (e.g. _text_).
   - Use clean emojis and bullet points (•) for lists.
   - Keep messages neat, well-spaced, complete, and punchy. NEVER end mid-sentence!`;

  try {
    const completion = await client.chat.completions.create({
      model: GROQ_LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `User message: "${params.userMessage}"\nTool result:\n${params.toolResultText}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 800,
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    return cleanWhatsAppFormatting(reply || params.toolResultText);
  } catch (err) {
    console.warn('[GROQ:response] Failed to generate interactive response:', err instanceof Error ? err.message : err);
    if (preferredName && !params.toolResultText.includes(preferredName)) {
      return cleanWhatsAppFormatting(`Hey ${preferredName}! 👋\n\n${params.toolResultText}`);
    }
    return cleanWhatsAppFormatting(params.toolResultText);
  }
}
