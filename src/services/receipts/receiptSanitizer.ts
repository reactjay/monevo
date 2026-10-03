/**
 * Receipt & Document Generation Input Sanitizer.
 *
 * Hardens document generation against Prompt Injection (GitHub Issue #19 / Finding #3).
 *
 * Requirements:
 * 1. Strips or escapes system control keywords, markdown injection, and role overrides
 *    (e.g., "System instruction:", "Assistant:", "System:", delimiters).
 * 2. Enforces character length limits:
 *    - payer_name: max 50 characters
 *    - description / notes: max 100 characters
 * 3. Provides clean, strongly-typed sanitized fields for receipt generation and templates.
 */

export const MAX_PAYER_NAME_LENGTH = 50;
export const MAX_DESCRIPTION_LENGTH = 100;
export const MAX_NOTES_LENGTH = 100;

export const DEFAULT_PAYER_NAME = 'Valued Customer';
export const DEFAULT_DESCRIPTION = 'Payment Received';

/**
 * System control keywords and role override prefixes that attackers use to trick LLMs
 * or contaminate downstream assistant notes and templates.
 */
const SYSTEM_ROLE_PREFIXES: RegExp[] = [
  /\b(?:system\s+instruction(?:s)?|system\s+prompt|system\s+directive|developer\s+instruction(?:s)?)\s*:\s*(?:override|bypass|jailbreak)?/gi,
  /\b(?:system|assistant|human|user|admin|developer|instruction(?:s)?)\s*:\s*(?:override|bypass|jailbreak)?/gi,
  /\[(?:system|instruction|assistant|user|human|admin|developer)\]/gi,
  /\[\/(?:system|instruction|assistant|user|human|admin|developer)\]/gi,
];

/**
 * Prompt injection control tokens, template braces, and chat format delimiters.
 */
const PROMPT_INJECTION_DELIMITERS: RegExp[] = [
  /\[\/?(?:inst|sys)\]/gi,
  /<<\/?sys>>/gi,
  /<\|im_start\|>\s*(?:system|user|assistant)?/gi,
  /<\|(?:im_start|im_end|system|user|assistant|endoftext)\|>/gi,
  /<\/?s>/gi,
  /\{\{|\}\}/g,
  /#{2,}/g, // Markdown header tokens like ###, ####
  /={3,}|-{3,}/g, // Delimiter divider lines
];

/**
 * Common prompt injection command phrases.
 */
const PROMPT_INJECTION_PHRASES: RegExp[] = [
  /\b(?:ignore|disregard|forget|bypass|override)\s+(?:all\s+)?(?:previous|prior|system|above)?\s*(?:instructions?|prompts?|rules?|directives?|restrictions?|filters?|guidelines?)\b/gi,
  /\b(?:you\s+are\s+now|act\s+as|pretend\s+to\s+be)\s+(?:a|an|the|in)?\s*(?:unrestricted|developer|jailbreak|new\s+system|admin|root|debug)\s*(?:mode)?\b/gi,
  /\bnew\s+system\s+directive\b/gi,
];

/**
 * Scripts and HTML/XML tag injection.
 */
const TAG_INJECTION_PATTERNS: RegExp[] = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi,
  /<style\b[^>]*>[\s\S]*?<\/style>/gi,
  /<[^>]+>/g, // Any HTML/XML tags
];

/**
 * Control characters, zero-width spaces, and invisible exploit codes.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_PATTERN = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g;

/**
 * Strips prompt injection keywords, role overrides, delimiters, and dangerous markup
 * from arbitrary text input.
 */
export function sanitizePromptInjection(text: string | null | undefined): string {
  if (!text) return '';

  let sanitized = String(text);

  // 1. Remove control characters and zero-width spaces
  sanitized = sanitized.replace(CONTROL_CHARS_PATTERN, ' ');

  // 2. Remove delimiters and template tokens (e.g. [INST], <<SYS>>, <|im_start|>, ###, ---)
  for (const pattern of PROMPT_INJECTION_DELIMITERS) {
    sanitized = sanitized.replace(pattern, ' ');
  }

  // 3. Remove system control keywords and role overrides ("System instruction:", "Assistant:", etc.)
  for (const pattern of SYSTEM_ROLE_PREFIXES) {
    sanitized = sanitized.replace(pattern, ' ');
  }

  // 4. Remove prompt injection command phrases
  for (const pattern of PROMPT_INJECTION_PHRASES) {
    sanitized = sanitized.replace(pattern, ' ');
  }

  // 5. Remove script and HTML/XML tags
  for (const pattern of TAG_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, ' ');
  }

  // 6. Remove any remaining stray angle brackets
  sanitized = sanitized.replace(/[<>]/g, ' ');

  // 7. Convert Markdown links [label](url) to just "label"
  sanitized = sanitized.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // 8. Strip raw markdown formatting characters (*, _, `, ~)
  sanitized = sanitized.replace(/[*_`~]/g, '');

  // 9. Collapse whitespace and trim
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Sanitizes and bounds a payer name.
 * - Strips system keywords, role overrides, and prompt injection tokens.
 * - Enforces max 50 characters.
 * - Falls back to DEFAULT_PAYER_NAME ('Valued Customer') if empty.
 */
export function sanitizePayerName(
  payerName: string | null | undefined,
  defaultName: string = DEFAULT_PAYER_NAME
): string {
  const sanitized = sanitizePromptInjection(payerName);
  if (!sanitized) {
    return defaultName;
  }
  // Enforce max 50 chars limit
  return sanitized.slice(0, MAX_PAYER_NAME_LENGTH).trim() || defaultName;
}

/**
 * Sanitizes and bounds a description or note.
 * - Strips system keywords, role overrides, and prompt injection tokens.
 * - Enforces max 100 characters.
 * - Falls back to DEFAULT_DESCRIPTION ('Payment Received') if empty.
 */
export function sanitizeDescription(
  description: string | null | undefined,
  defaultDesc: string = DEFAULT_DESCRIPTION
): string {
  const sanitized = sanitizePromptInjection(description);
  if (!sanitized) {
    return defaultDesc;
  }
  // Enforce max 100 chars limit
  return sanitized.slice(0, MAX_DESCRIPTION_LENGTH).trim() || defaultDesc;
}

/**
 * Strongly-typed raw input for receipt generation tool calls.
 */
export interface RawReceiptInput {
  payer_name?: string | null;
  payer?: string | null;
  counterparty?: string | null;
  amount?: number | string | null;
  description?: string | null;
  notes?: string | null;
  date?: string | Date | null;
  currency?: string | null;
  recipientName?: string | null;
}

/**
 * Strongly-typed sanitized output ready for receipt rendering and database storage.
 */
export interface SanitizedReceiptInput {
  payer_name: string;
  payer: string; // convenient alias
  amount: number;
  description: string;
  notes: string; // convenient alias
  date: Date;
  dateString: string;
  currency: string;
  recipientName?: string;
}

/**
 * Sanitizes all input fields for receipt generation deterministically.
 */
export function sanitizeReceiptInput(
  raw: RawReceiptInput,
  userCurrency: string = 'NGN'
): SanitizedReceiptInput {
  const rawPayer = raw.payer_name || raw.payer || raw.counterparty;
  const sanitizedPayer = sanitizePayerName(rawPayer);

  const rawDesc = raw.description || raw.notes;
  const defaultDesc = rawPayer ? `Payment from ${sanitizedPayer}` : DEFAULT_DESCRIPTION;
  const sanitizedDesc = sanitizeDescription(rawDesc, defaultDesc);

  let numAmount = 0;
  if (typeof raw.amount === 'number') {
    numAmount = raw.amount;
  } else if (typeof raw.amount === 'string') {
    const parsed = parseFloat(raw.amount.replace(/,/g, ''));
    if (!isNaN(parsed) && isFinite(parsed)) {
      numAmount = parsed;
    }
  }

  let parsedDate: Date;
  if (!raw.date) {
    parsedDate = new Date();
  } else if (raw.date instanceof Date) {
    parsedDate = isNaN(raw.date.getTime()) ? new Date() : raw.date;
  } else {
    parsedDate = new Date(raw.date);
    if (isNaN(parsedDate.getTime())) {
      parsedDate = new Date();
    }
  }

  const dateString = parsedDate.toISOString().slice(0, 10);
  const currency = (raw.currency || userCurrency || 'NGN').toUpperCase().trim();

  let sanitizedRecipient: string | undefined;
  if (raw.recipientName) {
    sanitizedRecipient = sanitizePayerName(raw.recipientName, 'Merchant');
  }

  return {
    payer_name: sanitizedPayer,
    payer: sanitizedPayer,
    amount: numAmount,
    description: sanitizedDesc,
    notes: sanitizedDesc,
    date: parsedDate,
    dateString,
    currency,
    recipientName: sanitizedRecipient,
  };
}
