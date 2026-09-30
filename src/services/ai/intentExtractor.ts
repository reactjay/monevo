import {
  FinancialIntent,
  FinancialIntentSchema,
  RecordTransactionIntent,
  ClarificationRequiredIntent,
  FinancialQueryIntent,
  GenerateReceiptIntent,
  ProfileUpdateIntent,
  HelpIntent,
  UnknownIntent,
} from './schemas';
import { parseNaturalDate } from './dateParser';
import { extractAmount, extractCurrency } from './amountParser';
import { inferCategory } from './categoryParser';

import { extractIntentWithGroq, isGroqConfigured } from './groqService';

export interface ExtractionOptions {
  defaultCurrency?: string;
  timezone?: string;
  referenceDate?: Date;
  userName?: string;
}

/**
 * Extracts counterparty names from transaction text (e.g. "from David", "David paid me", "paid Sarah").
 */
function extractCounterparty(text: string): string | null {
  // Pattern 1: "from <Name>" (e.g. "received 150000 from David", "from David for website")
  const fromMatch = text.match(/\bfrom\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i);
  if (fromMatch) {
    const rawWords = fromMatch[1].trim().split(/\s+/);
    const STOPWORDS = new Set([
      'money',
      'naira',
      'dollar',
      'dollars',
      'fuel',
      'food',
      'salary',
      'payment',
      'for',
      'on',
      'the',
      'my',
      'a',
      'an',
      'to',
    ]);
    const validWords: string[] = [];
    for (const w of rawWords) {
      if (STOPWORDS.has(w.toLowerCase())) break;
      validWords.push(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    }
    if (validWords.length > 0) {
      return validWords.join(' ');
    }
  }

  // Pattern 2: "<Name> paid me" (e.g. "David paid me 150k")
  const paidMeMatch = text.match(/\b([A-Za-z]+)\s+paid\s+me\b/i);
  if (paidMeMatch) {
    const raw = paidMeMatch[1];
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  }

  // Pattern 3: "to <Name>" or "paid <Name>" (e.g. "paid David 5000")
  const toMatch = text.match(/\b(?:to|paid)\s+([A-Za-z]+)\b/i);
  if (
    toMatch &&
    !['money', 'naira', 'dollar', 'dollars', 'for', 'the', 'my', 'fuel', 'food', 'salary'].includes(
      toMatch[1].toLowerCase()
    )
  ) {
    return toMatch[1].charAt(0).toUpperCase() + toMatch[1].slice(1).toLowerCase();
  }

  return null;
}

/**
 * Extracts a clean, human-readable description for a transaction.
 */
function extractDescription(
  text: string,
  category: string,
  type: 'income' | 'expense',
  counterparty: string | null
): string {
  // Check for "for <description>" (e.g. "for website development", "for fuel")
  const forMatch = text.match(/\bfor\s+([^,.]+)/i);
  if (forMatch) {
    const rawDesc = forMatch[1].trim();
    // Capitalize first letter
    return rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1);
  }

  // Check for "on <description>" (e.g. "on fuel", "on food", "on Drips")
  const onMatch = text.match(/\bon\s+([^,.]+)/i);
  if (onMatch) {
    const rawDesc = onMatch[1].trim().replace(/\s+(today|yesterday|this morning|last night)$/i, '');
    return rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1);
  }

  // Check for "from <description>" (e.g. "from Salary payment on Drips")
  const fromMatch = text.match(/\bfrom\s+([^,.]+)/i);
  if (fromMatch && !counterparty) {
    const rawDesc = fromMatch[1].trim().replace(/\s+(today|yesterday|this morning|last night)$/i, '');
    return rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1);
  }

  if (counterparty) {
    return type === 'income' ? `Payment from ${counterparty}` : `Payment to ${counterparty}`;
  }

  // Capitalize category name
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Main intent extraction pipeline for Monevo.
 * Analyzes natural language / voice transcripts and returns validated structured JSON.
 */
export async function extractIntent(
  text: string,
  options: ExtractionOptions = {}
): Promise<FinancialIntent> {
  const cleanText = text.trim();

  // ── 0. Groq AI LLM Intent Extraction (primary when configured) ──
  if (isGroqConfigured()) {
    try {
      const groqIntent = await extractIntentWithGroq(cleanText, options);
      if (groqIntent) {
        return groqIntent;
      }
    } catch (err) {
      console.warn('[INTENT] Groq extraction fallback:', err instanceof Error ? err.message : err);
    }
  }

  const lower = cleanText.toLowerCase().replace(/[?!.,;:]+$/, '').trim();

  const defaultCurrency = options.defaultCurrency ?? 'NGN';
  const timezone = options.timezone ?? 'Africa/Lagos';
  const referenceDate = options.referenceDate ?? new Date();

  // ── 1. Help Intent ──────────────────────────────────────────
  if (
    /^(help|\/?help|\/?commands|what can you do|how does this work)\b/i.test(cleanText) ||
    cleanText.toLowerCase() === 'help' ||
    cleanText.toLowerCase() === 'help.'
  ) {
    const helpResult: HelpIntent = { intent: 'help' };
    return FinancialIntentSchema.parse(helpResult);
  }

  // ── 1a. Preferred Name Update ───────────────────────────────
  const nameMatch = cleanText.match(/\b(?:call me|my name is|i prefer to be called|change my name to)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i);
  if (nameMatch) {
    const preferredName = nameMatch[1].trim();
    const profileResult: ProfileUpdateIntent = {
      intent: 'profile_update',
      fields: { name: preferredName },
    };
    return FinancialIntentSchema.parse(profileResult);
  }

  // ── 1b. Response Mode Switching (Voice vs Text) ─────────────
  if (
    /\b(reply\s+with\s+voice|voice\s+responses?(\s+please)?|use\s+voice(\s+mode)?|switch\s+to\s+voice|voice\s+mode(\s+on)?)\b/i.test(lower) ||
    lower === 'reply with voice' ||
    lower === 'voice responses please' ||
    lower === 'voice mode'
  ) {
    const profileResult: ProfileUpdateIntent = {
      intent: 'profile_update',
      fields: { responseMode: 'voice' },
    };
    return FinancialIntentSchema.parse(profileResult);
  }

  if (
    /\b(reply\s+with\s+text|text\s+responses?(\s+please)?|use\s+text(\s+mode)?|switch\s+to\s+text|text\s+mode(\s+on)?)\b/i.test(lower) ||
    lower === 'reply with text' ||
    lower === 'text responses please' ||
    lower === 'text mode'
  ) {
    const profileResult: ProfileUpdateIntent = {
      intent: 'profile_update',
      fields: { responseMode: 'text' },
    };
    return FinancialIntentSchema.parse(profileResult);
  }

  // ── 1b. Voice Response Mode Preference Updates ─────────────
  if (
    /\b(reply\s+with\s+voice|reply\s+in\s+voice|voice\s+responses?|enable\s+voice|switch\s+to\s+voice|voice\s+mode|send\s+voice\s+notes?)\b/i.test(
      lower
    )
  ) {
    const profileResult: ProfileUpdateIntent = {
      intent: 'profile_update',
      fields: { responseMode: 'voice' },
    };
    return FinancialIntentSchema.parse(profileResult);
  }

  if (
    /\b(text\s+responses?|reply\s+with\s+text|reply\s+in\s+text|text\s+mode|switch\s+to\s+text|send\s+text)\b/i.test(
      lower
    )
  ) {
    const profileResult: ProfileUpdateIntent = {
      intent: 'profile_update',
      fields: { responseMode: 'text' },
    };
    return FinancialIntentSchema.parse(profileResult);
  }

  // ── 2. Generate Receipt Intent ──────────────────────────────
  if (
    /\b(create|generate|send|make|issue|drop|get)\s+(a\s+)?receipt\b/i.test(lower) ||
    lower.startsWith('receipt for') ||
    lower.startsWith('receipt to') ||
    lower.startsWith('make receipt')
  ) {
    let counterparty = extractCounterparty(cleanText);
    if (!counterparty) {
      // Check for "receipt for/to <Name>" (e.g. "receipt for David", "receipt for Musa Ado bought...")
      const receiptForMatch = cleanText.match(/\breceipt\s+(?:for|to)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i);
      if (receiptForMatch) {
        const words = receiptForMatch[1].trim().split(/\s+/);
        const STOPWORDS = new Set(['the', 'a', 'an', 'my', 'money', 'payment', 'for', 'from', 'to', 'received', 'on', 'of', 'and', 'bought', 'paid']);
        const validWords = words.filter(w => !STOPWORDS.has(w.toLowerCase()));
        if (validWords.length > 0) {
          const candidateName = validWords.join(' ');
          const parsedAsAmt = extractAmount(candidateName, defaultCurrency);
          if (!parsedAsAmt) {
            counterparty = candidateName.charAt(0).toUpperCase() + candidateName.slice(1);
          }
        }
      }
    }

    const amountData = extractAmount(cleanText, defaultCurrency);

    // Extract description
    let description: string | undefined;

    // Direct extraction by stripping receipt prefixes, counterparty, amount, and date words
    let remaining = cleanText;
    remaining = remaining.replace(/\b(create|generate|send|make|issue|drop|get)\s+(a\s+)?receipt\s+(for|to)?\b/gi, '');
    remaining = remaining.replace(/^receipt\s+(for|to)\s+/gi, '');
    if (counterparty) {
      remaining = remaining.replace(new RegExp(`\\b${counterparty}\\b`, 'gi'), '');
    }
    if (amountData) {
      // Remove raw amount numbers and currency signs
      remaining = remaining.replace(new RegExp(`[₦$£€]?\\s*${amountData.amount.toLocaleString()}\\b`, 'gi'), '');
      remaining = remaining.replace(new RegExp(`[₦$£€]?\\s*${amountData.amount}\\b`, 'gi'), '');
      remaining = remaining.replace(/\b\d+([kKmM])?\b/g, (match) => {
        const amt = extractAmount(match, defaultCurrency);
        return amt && amt.amount === amountData.amount ? '' : match;
      });
    }
    // Remove date indicators
    remaining = remaining.replace(/\b(today|yesterday|this morning|last night|tonight)\b/gi, '');
    // Clean phrases like "received from", "paid by"
    remaining = remaining.replace(/\breceived\s+(from\s+)?/gi, '');
    remaining = remaining.replace(/\bpaid\s+(by|to\s+)?/gi, '');
    // Clean leading action prepositions (e.g. "bought", "for", "paid for", "received for")
    remaining = remaining.replace(/^\s*(bought|paid\s+for|received\s+for|for|payment\s+for)\s+/i, '');
    remaining = remaining.replace(/[,\.]+/g, ' ').trim();

    if (remaining.length > 1) {
      description = remaining.charAt(0).toUpperCase() + remaining.slice(1);
    }

    // Fallback description check if empty
    if (!description) {
      const allForMatches = Array.from(cleanText.matchAll(/\bfor\s+([^,.]+)/gi));
      for (const match of allForMatches) {
        const candidate = match[1].trim();
        const candidateAmount = extractAmount(candidate, defaultCurrency);
        const isJustAmount = candidateAmount && candidate.replace(/[\d,.\s₦$€£kKmbnaira]+/g, '').length === 0;
        const isJustCounterparty = counterparty && candidate.toLowerCase() === counterparty.toLowerCase();
        if (!isJustAmount && !isJustCounterparty) {
          description = candidate.charAt(0).toUpperCase() + candidate.slice(1);
          break;
        }
      }
    }

    if (!description && (counterparty || amountData)) {
      description = counterparty ? `Payment from ${counterparty}` : 'Payment Received';
    }

    const receiptResult: GenerateReceiptIntent = {
      intent: 'generate_receipt',
      target: {
        counterparty: counterparty ?? null,
        amount: amountData?.amount,
        description,
      },
    };
    return FinancialIntentSchema.parse(receiptResult);
  }

  // ── 3. Financial Query Intents ──────────────────────────────
  // 3a. Weekly Visual Report / Analytics Query (e.g. "Weekly summary", "Spending analysis", "spending analytics", "weekly analytics", "weekly report", "visual report")
  if (
    /\b(spending\s+analytics|spending\s+anlytics|spending\s+analysis|spending\s+summary|spending\s+breakdown|spending\s+report|weekly\s+analytics|weekly\s+anlytics|weekly\s+analysis|weekly\s+summary|weekly\s+report|financial\s+analytics|financial\s+analysis|financial\s+summary|expense\s+analysis|expense\s+summary|show\s+analytics|my\s+analytics|my\s+analysis|get\s+analytics|view\s+analytics|analytics|anlytics|analitics)\b/i.test(lower) ||
    /\b(send|show|get|generate|view|see)?\s*(my\s+)?weekly\s+(financial\s+)?(report|analytics|anlytics|analysis|summary|visual\s+report|summary\s+report|infographic)\b/i.test(lower) ||
    lower.startsWith('weekly report') ||
    lower.startsWith('weekly analytics') ||
    lower.startsWith('weekly anlytics') ||
    lower.startsWith('weekly summary') ||
    lower.startsWith('weekly analysis') ||
    lower.startsWith('spending analysis') ||
    lower.startsWith('spending analytics') ||
    lower.startsWith('spending summary') ||
    lower.startsWith('expense analysis') ||
    lower.startsWith('expense summary') ||
    lower === 'spending analysis' ||
    lower === 'spending analytics' ||
    lower === 'spending summary' ||
    lower === 'spending anlytics' ||
    lower === 'weekly summary' ||
    lower === 'weekly analysis' ||
    lower === 'weekly analytics' ||
    lower === 'weekly anlytics' ||
    lower === 'analytics' ||
    lower === 'anlytics' ||
    lower === 'analitics' ||
    lower === 'my weekly expenses' ||
    lower === 'weekly expenses'
  ) {
    const isLastWeek = lower.includes('last week');
    const queryResult: FinancialQueryIntent = {
      intent: 'financial_query',
      queryType: 'weekly_report',
      period: isLastWeek ? 'last_week' : 'this_week',
    };
    return FinancialIntentSchema.parse(queryResult);
  }

  // 3b. Period Comparison Query (e.g. "Compare this month with last month", "Compare this week with last week")
  if (/\bcompare\s+(this\s+month|this\s+week)\s+with\s+(last\s+month|last\s+week)\b/i.test(lower)) {
    const isWeek = lower.includes('week');
    const queryResult: FinancialQueryIntent = {
      intent: 'financial_query',
      queryType: 'compare_periods',
      period: isWeek ? 'this_week' : 'this_month',
      comparePeriod: isWeek ? 'last_week' : 'last_month',
    };
    return FinancialIntentSchema.parse(queryResult);
  }

  // 3c. Largest / Biggest Expense Query
  if (
    /\b(largest|biggest|highest|maximum|top)\s+expense\b/i.test(lower) ||
    /\bwhat (is|was) my (biggest|largest) expense\b/i.test(lower)
  ) {
    let period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' = 'this_month';
    if (lower.includes('today')) period = 'today';
    else if (lower.includes('yesterday')) period = 'yesterday';
    else if (lower.includes('this week') || lower.includes('week')) period = 'this_week';
    else if (lower.includes('last week')) period = 'last_week';
    else if (lower.includes('last month')) period = 'last_month';

    const queryResult: FinancialQueryIntent = {
      intent: 'financial_query',
      queryType: 'largest_expense',
      period,
    };
    return FinancialIntentSchema.parse(queryResult);
  }

  // 3d. Specific Category Spend Query (e.g. "How much did I spend on food?", "How much spent on fuel this week?")
  const spendOnCatMatch = lower.match(
    /\bhow\s+much\s+(?:did\s+i\s+spend|spent|i\s+spend)\s+on\s+([a-z]+)\b/i
  );
  if (spendOnCatMatch) {
    const rawCat = spendOnCatMatch[1];
    const category = inferCategory(rawCat, 'expense');
    let period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' = 'this_month';
    if (lower.includes('today')) period = 'today';
    else if (lower.includes('yesterday')) period = 'yesterday';
    else if (lower.includes('this week') || lower.includes('week')) period = 'this_week';
    else if (lower.includes('last week')) period = 'last_week';
    else if (lower.includes('last month')) period = 'last_month';

    const queryResult: FinancialQueryIntent = {
      intent: 'financial_query',
      queryType: 'category_spend',
      category,
      period,
    };
    return FinancialIntentSchema.parse(queryResult);
  }

  // 3e. Income-Specific Query (e.g. "How much did I make this month?", "How much enter my account?", "how much I don collect")
  if (
    /\bhow\s+much\s+(?:did\s+i\s+|i\s+)?(?:make|earn|receive|collect|enter(?:\s+my\s+account)?)\b/i.test(lower) ||
    /\b(total|summary\s+of)\s+income\b/i.test(lower) ||
    /\bhow\s+much\s+i\s+don\s+collect\b/i.test(lower)
  ) {
    let period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' = 'this_month';
    if (lower.includes('today')) period = 'today';
    else if (lower.includes('yesterday')) period = 'yesterday';
    else if (lower.includes('this week') || lower.includes('week')) period = 'this_week';
    else if (lower.includes('last week')) period = 'last_week';
    else if (lower.includes('last month')) period = 'last_month';

    const queryResult: FinancialQueryIntent = {
      intent: 'financial_query',
      queryType: 'income_summary',
      period,
    };
    return FinancialIntentSchema.parse(queryResult);
  }

  // 3f. Category Summary / Most Spent On Query (e.g. "Where did my money go?", "where my money go", "wetin I spend pass")
  if (
    /\bwhere\s+(am\s+i|did\s+i)\s+spending\s+(the\s+most\s+money|most)\b/i.test(lower) ||
    /\bwhat\s+did\s+i\s+spend\s+the\s+most\s+on\b/i.test(lower) ||
    /\b(where\s+(?:did\s+)?my\s+money\s+go|where\s+money\s+dey\s+go)\b/i.test(lower) ||
    /\b(wetin\s+i\s+spend\s+pass|wetin\s+take\s+my\s+money)\b/i.test(lower) ||
    /\bcategory\s+summary\b/i.test(lower) ||
    /\bbreakdown\b/i.test(lower)
  ) {
    let period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' = 'this_month';
    if (lower.includes('today')) period = 'today';
    else if (lower.includes('yesterday')) period = 'yesterday';
    else if (lower.includes('this week') || lower.includes('week')) period = 'this_week';
    else if (lower.includes('last week')) period = 'last_week';
    else if (lower.includes('last month')) period = 'last_month';

    const queryResult: FinancialQueryIntent = {
      intent: 'financial_query',
      queryType: 'category_summary',
      period,
    };
    return FinancialIntentSchema.parse(queryResult);
  }

  // 3g. Specific Category Expenses Query (e.g. "Show my transport expenses", "Food expenses this month")
  const showCategoryMatch = lower.match(
    /\b(?:show|list|get|check)?\s*(?:my\s+)?(fuel|food|transport|rent|utilities|groceries|shopping|health|education|entertainment)\s+expenses\b/i
  );
  if (showCategoryMatch) {
    const rawCat = showCategoryMatch[1];
    const normalizedCat = inferCategory(rawCat, 'expense');
    let period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' = 'this_month';
    if (lower.includes('today')) period = 'today';
    else if (lower.includes('yesterday')) period = 'yesterday';
    else if (lower.includes('this week') || lower.includes('week')) period = 'this_week';
    else if (lower.includes('last week')) period = 'last_week';
    else if (lower.includes('last month')) period = 'last_month';

    const queryResult: FinancialQueryIntent = {
      intent: 'financial_query',
      queryType: 'category_summary',
      category: normalizedCat,
      period,
    };
    return FinancialIntentSchema.parse(queryResult);
  }

  // 3h. Period Summary Query (e.g. "How much did I spend this week?", "how much I don spend", "how much comot", "Total expenses today")
  if (
    /\bhow\s+much\s+(?:did\s+i\s+spend|i\s+spend|i\s+don\s+spend|comot)\b/i.test(lower) ||
    /\b(total|summary\s+of)\s+(spending|expenses)\b/i.test(lower)
  ) {
    let period: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' = 'this_month';
    if (lower.includes('today')) period = 'today';
    else if (lower.includes('yesterday')) period = 'yesterday';
    else if (lower.includes('this week') || lower.includes('week')) period = 'this_week';
    else if (lower.includes('last week')) period = 'last_week';
    else if (lower.includes('this month') || lower.includes('month')) period = 'this_month';
    else if (lower.includes('last month')) period = 'last_month';

    const queryResult: FinancialQueryIntent = {
      intent: 'financial_query',
      queryType: 'period_summary',
      period,
    };
    return FinancialIntentSchema.parse(queryResult);
  }

  // 3i. Balance Query (Standard & Nigerian English / Pidgin: "how much de my account", "how much dey my account", "my balance", "balance", "wetin remain", "how much I hold")
  if (
    /\b(what is my balance|check balance|my balance|balance|how much do i have|net balance|account balance|check my balance)\b/i.test(lower) ||
    /\b(how\s+much\s+(?:de|dey|in|inside|for|remain|i\s+get|i\s+hold|i\s+have))\b/i.test(lower) ||
    /\bhow\s+much\s+(?:is\s+)?(?:in|inside|on|for|de|dey)\s+(?:my\s+)?(?:account|balance|wallet|pocket)?\b/i.test(lower) ||
    /\b(?:de|dey)\s+(?:my\s+)?(?:account|balance|wallet)\b/i.test(lower) ||
    /\b(wetin\s+remain|wetin\s+de\s+remain|wetin\s+dey\s+remain|how\s+much\s+de\s+my\s+account|how\s+much\s+dey\s+my\s+account|how\s+much\s+de\s+inside|how\s+much\s+dey\s+inside)\b/i.test(lower) ||
    (lower.includes('my account') && lower.includes('how much')) ||
    (lower.includes('account') && (lower.includes('de') || lower.includes('dey') || lower.includes('how much'))) ||
    lower === 'balance' ||
    lower === 'my balance' ||
    lower === 'check balance'
  ) {
    const queryResult: FinancialQueryIntent = {
      intent: 'financial_query',
      queryType: 'balance',
    };
    return FinancialIntentSchema.parse(queryResult);
  }

  // ── 4. Transaction Recording Intent & Missing Info Detection ──
  // Nigerian Pidgin & English Income & Expense indicators
  const isIncome =
    /\b(received|recieved|receive|receve|got\s+paid|paid\s+me|pay\s+me|salary|wages?|stipend|allowance|dividend|dividends|earned|got\s+credit|credit\s+of|credit\s+alert|credited|deposit\s+of|deposited|deposit|salary\s+from|collect|collected|dem\s+pay\s+me|dem\s+send\s+me|cash\s+in|transfer\s+from|payment\s+from|payment\s+for|payment\s+on|income)\b/i.test(
      lower
    );

  const isExpense =
    /\b(spent|spend|paid|pay|bought|buy|purchased|chop|comot|remove|dash|recharge|drop|fuel|petrol|diesel|food|lunch|dinner|shawarma|suya|transport|danfo|keke|uber|bolt|groceries|supermarket|light bill|nepa|phcn|data|airtime|pos charge|deep freezer|generator)\b/i.test(
      lower
    ) || lower.startsWith('spent') || lower.startsWith('paid') || lower.startsWith('chop') || lower.startsWith('bought');

  const hasTransactionIntent = isIncome || isExpense;

  if (hasTransactionIntent) {
    const transactionType: 'income' | 'expense' = isIncome ? 'income' : 'expense';
    const amountData = extractAmount(cleanText, defaultCurrency);
    const counterparty = extractCounterparty(cleanText);
    const category = inferCategory(cleanText, transactionType);
    const date = parseNaturalDate(cleanText, referenceDate, timezone);
    const description = extractDescription(cleanText, category, transactionType, counterparty);

    // Critical Safety Rule: If amount is missing, never invent it!
    if (!amountData || amountData.amount <= 0) {
      const prompt =
        category && category !== 'general'
          ? `How much did you spend on ${category}?`
          : 'How much did you spend or receive?';

      const clarificationResult: ClarificationRequiredIntent = {
        intent: 'clarification_required',
        missing: ['amount'],
        clarificationPrompt: prompt,
        partial: {
          type: transactionType,
          category,
          description,
          counterparty,
          currency: extractCurrency(cleanText, defaultCurrency),
          date,
        },
      };
      return FinancialIntentSchema.parse(clarificationResult);
    }

    // Complete transaction record
    const recordResult: RecordTransactionIntent = {
      intent: 'record_transaction',
      transaction: {
        type: transactionType,
        amount: amountData.amount,
        currency: amountData.currency,
        category,
        description,
        counterparty,
        date,
      },
    };
    return FinancialIntentSchema.parse(recordResult);
  }

  // ── 5. Unrecognized / Fallback Intent ───────────────────────
  const unknownResult: UnknownIntent = {
    intent: 'unknown',
    rawText: cleanText,
  };
  return FinancialIntentSchema.parse(unknownResult);
}
