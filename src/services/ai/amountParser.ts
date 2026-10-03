/**
 * Module for extracting numeric amounts, currencies, and word-based numbers from text.
 */

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/**
 * Converts English number words to a numeric value.
 * Example: "one hundred and fifty thousand" -> 150000
 */
export function wordsToNumber(text: string): number | null {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .split(/[\s-]+/)
    .filter((w) => w !== 'and' && w.length > 0);

  if (words.length === 0) return null;

  let total = 0;
  let current = 0;
  let hasNumberWord = false;

  for (const word of words) {
    if (word in SMALL_NUMBERS) {
      current += SMALL_NUMBERS[word];
      hasNumberWord = true;
    } else if (word === 'hundred') {
      current = (current || 1) * 100;
      hasNumberWord = true;
    } else if (word === 'thousand') {
      total += (current || 1) * 1000;
      current = 0;
      hasNumberWord = true;
    } else if (word === 'million') {
      total += (current || 1) * 1000000;
      current = 0;
      hasNumberWord = true;
    } else if (word === 'billion') {
      total += (current || 1) * 1000000000;
      current = 0;
      hasNumberWord = true;
    } else {
      // Non-number word encountered
      if (hasNumberWord) {
        break;
      }
    }
  }

  const result = total + current;
  return hasNumberWord && result > 0 ? result : null;
}

export interface ExtractedAmount {
  amount: number;
  currency: string;
}

/**
 * Normalizes currency terms to 3-letter ISO code.
 */
export function extractCurrency(text: string, defaultCurrency = 'NGN'): string {
  const lower = text.toLowerCase();
  if (/\b(naira|ngn|₦)\b/i.test(lower) || text.includes('₦')) {
    return 'NGN';
  }
  if (/\b(dollar|dollars|usd|\$)\b/i.test(lower) || text.includes('$')) {
    return 'USD';
  }
  if (/\b(pound|pounds|gbp|£)\b/i.test(lower) || text.includes('£')) {
    return 'GBP';
  }
  if (/\b(euro|euros|eur|€)\b/i.test(lower) || text.includes('€')) {
    return 'EUR';
  }
  const isoMatch = lower.match(/\b([a-z]{3})\b/);
  if (isoMatch && ['cad', 'ghs', 'kes', 'zar', 'aud'].includes(isoMatch[1])) {
    return isoMatch[1].toUpperCase();
  }
  return defaultCurrency.toUpperCase();
}

export const USD_CURRENCY_REGEX = /\$|\b(?:usd|dollars?)\b/i;
export const NGN_CURRENCY_REGEX = /₦|\b(?:ngn|naira)\b/i;

export const THOUSAND_MULTIPLIER_REGEX = /^(?:k|thousands?)$/i;
export const MILLION_MULTIPLIER_REGEX = /^(?:m|mils?|millions?|bars?)$/i;

export const SLANG_AMOUNT_REGEX =
  /(?:[₦$£€]|(?:NGN|USD)\s*)?\s*(-?\d+(?:,\d{3})*(?:\.\d+)?|-?\d*\.\d+)\s*(thousands?|k|millions?|mils?|bars?|m)\b/gi;

export const PLAIN_AMOUNT_REGEX =
  /(?:[₦$£€]|(?:NGN|USD)\s*)?\s*(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)\b/g;

export interface ParsedTransaction {
  amount: number;
  currency: 'NGN' | 'USD';
  valid?: boolean;
  error?: string;
}

/**
 * Normalizes Nigerian numerical slang and currency formats from conversational text.
 *
 * Requirements:
 * 1. Handles abbreviations in conversational text:
 *    - "k" or "thousand" -> multiply by 1,000 (e.g., "500k" -> 500,000)
 *    - "m" or "mils" / "million" / "bar" -> multiply by 1,000,000 (e.g., "1.5m" or "2bar" -> 1,500,000 or 2,000,000)
 * 2. Detects currency context (NGN / ₦ vs USD / $). Defaults to NGN if unspecified.
 * 3. Returns a clean positive numeric integer representing major units without ledger arithmetic.
 * 4. Explicitly rejects <= 0. If a negative value is parsed (e.g., "-5000"), returns a validation error
 *    stating amounts must be strictly positive without sign-flipping.
 */
export function parseTransaction(text: string): ParsedTransaction | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Detect currency context (NGN / ₦ vs USD / $). Default to NGN if unspecified.
  const currency: 'NGN' | 'USD' = USD_CURRENCY_REGEX.test(text) ? 'USD' : 'NGN';

  // 2. Handle abbreviations and Nigerian numerical slang
  const slangMatches = [...text.matchAll(SLANG_AMOUNT_REGEX)];
  if (slangMatches.length > 0) {
    const candidates = slangMatches
      .map((match) => {
        const rawNum = parseFloat(match[1].replace(/,/g, ''));
        const unit = match[2].toLowerCase();
        let multiplier = 1;

        if (THOUSAND_MULTIPLIER_REGEX.test(unit)) {
          multiplier = 1_000;
        } else if (MILLION_MULTIPLIER_REGEX.test(unit)) {
          multiplier = 1_000_000;
        }

        // Do NOT sign-flip with Math.abs
        return Math.round(rawNum * multiplier);
      })
      .filter((amt) => !isNaN(amt));

    if (candidates.length > 0) {
      // Find candidate: if any negative or zero is parsed, or max candidate
      const negativeCandidate = candidates.find((c) => c <= 0);
      if (negativeCandidate !== undefined) {
        return {
          amount: negativeCandidate,
          currency,
          valid: false,
          error: 'Amounts must be strictly positive. Negative amounts are not allowed.',
        };
      }

      return {
        amount: Math.max(...candidates),
        currency,
      };
    }
  }

  // 3. Fallback to plain numeric values
  const plainMatches = [...text.matchAll(PLAIN_AMOUNT_REGEX)];
  if (plainMatches.length > 0) {
    const candidates = plainMatches
      .map((match) => {
        const raw = match[1];
        const val = parseFloat(raw.replace(/,/g, ''));
        let score = 0;
        if (raw.includes(',')) score += 100;
        const absVal = Math.abs(val);
        if (absVal >= 1000) score += 50;
        else if (absVal >= 100) score += 30;
        if (absVal <= 10 && plainMatches.length > 1) score -= 50; // likely a quantity
        // Do NOT sign-flip with Math.abs
        return { val: Math.round(val), score };
      })
      .filter((c) => !isNaN(c.val));

    if (candidates.length > 0) {
      // If any candidate is negative or zero, do not sign-flip; return validation error
      const negativeCandidate = candidates.find((c) => c.val <= 0);
      if (negativeCandidate !== undefined) {
        return {
          amount: negativeCandidate.val,
          currency,
          valid: false,
          error: 'Amounts must be strictly positive. Negative amounts are not allowed.',
        };
      }

      candidates.sort((a, b) => b.score - a.score || b.val - a.val);
      return {
        amount: candidates[0].val,
        currency,
      };
    }
  }

  return null;
}

/**
 * Extracts numeric amount from string, supporting standard digits, formatted digits,
 * k/m shorthand, Nigerian slang (thousand, mils, million, bar), and written words.
 * Smartly distinguishes prices from item quantities (e.g. "1 deep freezer 250,000").
 */
export function extractAmount(text: string, defaultCurrency = 'NGN'): ExtractedAmount | null {
  const currency = extractCurrency(text, defaultCurrency);

  // 1. Explicit currency symbol or currency code match (highest confidence)
  // e.g. ₦250,000, $150, ₦ 5000, NGN 250000, 150000 naira
  const explicitCurrencyRegex = /(?:[₦$£€]|(?:NGN|USD|GBP|EUR)\s+)\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(thousands?|k|millions?|mils?|bars?|m)?\b|\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(thousands?|k|millions?|mils?|bars?|m)?\s*(?:naira|dollars|pounds|euros|ngn|usd|gbp|eur)\b/i;
  const explicitMatch = text.match(explicitCurrencyRegex);
  if (explicitMatch) {
    const rawNum = (explicitMatch[1] || explicitMatch[3])?.replace(/,/g, '');
    const suffix = (explicitMatch[2] || explicitMatch[4])?.toLowerCase();
    if (rawNum) {
      let val = parseFloat(rawNum);
      if (suffix) {
        if (THOUSAND_MULTIPLIER_REGEX.test(suffix)) val *= 1_000;
        else if (MILLION_MULTIPLIER_REGEX.test(suffix)) val *= 1_000_000;
      }
      if (!isNaN(val) && val > 0) {
        return { amount: Math.round(val * 100) / 100, currency };
      }
    }
  }

  // 2. Shorthand and Nigerian slang notation like 150k, 2bar, 1.5m, 1.5mils, 2.5 million
  const slangMatch = text.match(
    /(?:[₦$£€]|(?:NGN|USD|GBP|EUR)\s+)?\s*(\d+(?:,\d{3})*(?:\.\d+)?|\d*\.\d+)\s*(thousands?|k|millions?|mils?|bars?|m)\b/i
  );
  if (slangMatch) {
    const val = parseFloat(slangMatch[1].replace(/,/g, ''));
    const unit = slangMatch[2].toLowerCase();
    const multiplier = THOUSAND_MULTIPLIER_REGEX.test(unit) ? 1_000 : 1_000_000;
    if (!isNaN(val) && val > 0) {
      return {
        amount: Math.round(val * multiplier * 100) / 100,
        currency,
      };
    }
  }

  // 3. Collect all candidate numbers in text
  const digitRegex = /\b(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\b/g;
  const matches = [...text.matchAll(digitRegex)];

  if (matches.length > 0) {
    // Score each candidate:
    // - Numbers with comma separators (e.g. 250,000) get +100
    // - Larger amounts get higher score (prices are typically larger than quantities)
    // - If a number is <= 10 and appears before an item noun, it's likely a quantity
    const candidates = matches.map((m) => {
      const raw = m[1];
      const hasComma = raw.includes(',');
      const val = parseFloat(raw.replace(/,/g, ''));
      const index = m.index ?? 0;
      let score = 0;
      if (hasComma) score += 100;
      if (val >= 100) score += 50;
      if (val >= 1000) score += 30;
      if (val <= 10 && matches.length > 1) score -= 50; // likely a quantity count

      return { val, score, index, raw };
    }).filter((c) => !isNaN(c.val) && c.val > 0);

    if (candidates.length > 0) {
      // Sort by score descending, then by value descending
      candidates.sort((a, b) => b.score - a.score || b.val - a.val);
      return {
        amount: candidates[0].val,
        currency,
      };
    }
  }

  // 4. Spoken number words (e.g. "one hundred and fifty thousand naira")
  const wordAmount = wordsToNumber(text);
  if (wordAmount && wordAmount > 0) {
    return {
      amount: wordAmount,
      currency,
    };
  }

  return null;
}

