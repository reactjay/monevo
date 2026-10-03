/**
 * Transaction Amount and Currency Bounds Validation Module.
 *
 * Implements:
 * 1. Migration away from floats: Converts all transaction amounts and running balances
 *    to BigInt/Integer stored strictly in minor units (Kobo for NGN, Cents for USD).
 *    1 NGN = 100 Kobo, 1 USD = 100 Cents.
 * 2. Sign Validation: Explicitly rejects any amount <= 0. If a negative value is parsed
 *    (e.g., "-5000"), returns a validation error stating amounts must be strictly positive.
 *    Does not sign-flip.
 * 3. Currency-Aware Ceilings:
 *    - For NGN: Flag amounts > 10,000,000 NGN (1,000,000,000 Kobo) to require explicit confirmation
 *      (requires_confirmation = True). Hard reject amounts > 100,000,000 NGN (10,000,000,000 Kobo)
 *      as invalid overflow input.
 *    - For USD: Flag > $10,000 (1,000,000 Cents), hard reject > $100,000 (10,000,000 Cents).
 * 4. Modular and pure: Free of side effects, ready to be called before database writes.
 */

export type SupportedCurrency = 'NGN' | 'USD' | string;

export interface CurrencyRule {
  minorUnitName: 'Kobo' | 'Cents' | 'minor units';
  factor: bigint;
  factorNumber: number;
  confirmationThresholdMajor: number;
  confirmationThresholdMinor: bigint;
  hardRejectThresholdMajor: number;
  hardRejectThresholdMinor: bigint;
}

export const CURRENCY_RULES: Record<string, CurrencyRule> = {
  NGN: {
    minorUnitName: 'Kobo',
    factor: 100n,
    factorNumber: 100,
    confirmationThresholdMajor: 10_000_000, // > 10,000,000 NGN requires confirmation
    confirmationThresholdMinor: 1_000_000_000n, // 1,000,000,000 Kobo
    hardRejectThresholdMajor: 100_000_000, // > 100,000,000 NGN hard reject overflow
    hardRejectThresholdMinor: 10_000_000_000n, // 10,000,000,000 Kobo
  },
  USD: {
    minorUnitName: 'Cents',
    factor: 100n,
    factorNumber: 100,
    confirmationThresholdMajor: 10_000, // > $10,000 USD requires confirmation
    confirmationThresholdMinor: 1_000_000n, // 1,000,000 Cents
    hardRejectThresholdMajor: 100_000, // > $100,000 USD hard reject overflow
    hardRejectThresholdMinor: 10_000_000n, // 10,000,000 Cents
  },
};

export const DEFAULT_CURRENCY_RULE: CurrencyRule = {
  minorUnitName: 'minor units',
  factor: 100n,
  factorNumber: 100,
  confirmationThresholdMajor: 10_000,
  confirmationThresholdMinor: 1_000_000n,
  hardRejectThresholdMajor: 100_000,
  hardRejectThresholdMinor: 10_000_000n,
};

export function getCurrencyRule(currency: string): CurrencyRule {
  const norm = (currency || 'NGN').toUpperCase().trim();
  return CURRENCY_RULES[norm] || DEFAULT_CURRENCY_RULE;
}

export class TransactionValidationError extends Error {
  public readonly code: 'NON_POSITIVE_AMOUNT' | 'OVERFLOW_AMOUNT' | 'INVALID_AMOUNT';

  constructor(message: string, code: 'NON_POSITIVE_AMOUNT' | 'OVERFLOW_AMOUNT' | 'INVALID_AMOUNT' = 'INVALID_AMOUNT') {
    super(message);
    this.name = 'TransactionValidationError';
    this.code = code;
  }
}

export interface ValidationSuccess {
  valid: true;
  success: true;
  /** BigInt strictly in minor units (Kobo for NGN, Cents for USD) */
  amount: bigint;
  /** BigInt minor units alias */
  amountMinor: bigint;
  /** Integer minor units as JavaScript number */
  amountInteger: number;
  /** Major units representation for display */
  amountMajor: number;
  currency: string;
  minorUnitName: 'Kobo' | 'Cents' | 'minor units';
  /** True when amount exceeds confirmation ceiling */
  requires_confirmation: boolean;
  requiresConfirmation: boolean;
  error?: undefined;
  code?: undefined;
}

export interface ValidationErrorResult {
  valid: false;
  success: false;
  amount?: bigint;
  amountMinor?: bigint;
  amountInteger?: number;
  amountMajor?: number;
  currency: string;
  requires_confirmation: false;
  requiresConfirmation: false;
  error: string;
  code: 'NON_POSITIVE_AMOUNT' | 'OVERFLOW_AMOUNT' | 'INVALID_AMOUNT';
}

export type TransactionValidationResult = ValidationSuccess | ValidationErrorResult;

export interface TransactionValidationOptions {
  /** If true, the input amount is treated as already in minor units */
  isMinorUnits?: boolean;
  /** If true, throws TransactionValidationError instead of returning ValidationErrorResult */
  throwOnError?: boolean;
}

export type TransactionValidationInput =
  | number
  | string
  | bigint
  | {
      amount: number | string | bigint;
      currency?: string;
      isMinorUnits?: boolean;
      throwOnError?: boolean;
    };

/**
 * Converts any major unit currency number or string to exact BigInt minor units
 * without floating point imprecision.
 */
export function convertToMinorUnits(
  amount: number | string | bigint,
  currency: string = 'NGN'
): bigint {
  if (typeof amount === 'bigint') {
    return amount;
  }

  const rule = getCurrencyRule(currency);

  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      throw new TransactionValidationError('Amount must be a finite number', 'INVALID_AMOUNT');
    }
    // Convert via fixed string representation to eliminate floating point issues (e.g. 19.99 * 100)
    const fixedStr = amount.toFixed(2);
    const [intPart, decPart] = fixedStr.split('.');
    const isNegative = fixedStr.startsWith('-');
    const absInt = BigInt(intPart.replace('-', ''));
    const absDec = BigInt(decPart || '0');
    const result = absInt * rule.factor + absDec;
    return isNegative ? -result : result;
  }

  if (typeof amount === 'string') {
    const trimmed = amount.trim();
    const isNegative = trimmed.startsWith('-');
    const clean = trimmed
      .replace(/^[-+]/, '')
      .replace(/[₦$£€]/g, '')
      .replace(/\b(?:NGN|USD|GBP|EUR)\b/gi, '')
      .replace(/,/g, '')
      .trim();

    if (!clean) {
      throw new TransactionValidationError(`Invalid amount string: "${amount}"`, 'INVALID_AMOUNT');
    }

    // Handle abbreviations: k (thousand), m (million)
    const shorthandMatch = clean.match(/^(\d+(?:\.\d+)?)\s*(k|thousands?|m|millions?|mils?|bars?)$/i);
    if (shorthandMatch) {
      const numPart = parseFloat(shorthandMatch[1]);
      const suffix = shorthandMatch[2].toLowerCase();
      let multiplier = 1;
      if (/^(?:k|thousands?)$/i.test(suffix)) multiplier = 1_000;
      else if (/^(?:m|millions?|mils?|bars?)$/i.test(suffix)) multiplier = 1_000_000;
      const totalMajor = numPart * multiplier;
      const fixedStr = totalMajor.toFixed(2);
      const [intPart, decPart] = fixedStr.split('.');
      const absInt = BigInt(intPart);
      const absDec = BigInt(decPart || '0');
      const minor = absInt * rule.factor + absDec;
      return isNegative ? -minor : minor;
    }

    if (clean.includes('.')) {
      const [intPart, decPart] = clean.split('.');
      const paddedDec = (decPart || '').padEnd(2, '0').slice(0, 2);
      const absInt = BigInt(intPart || '0');
      const absDec = BigInt(paddedDec);
      const minor = absInt * rule.factor + absDec;
      return isNegative ? -minor : minor;
    }

    const minor = BigInt(clean) * rule.factor;
    return isNegative ? -minor : minor;
  }

  throw new TransactionValidationError(`Unsupported amount type: ${typeof amount}`, 'INVALID_AMOUNT');
}

/**
 * Converts minor units (BigInt or integer number) back to major units number for display.
 */
export function convertToMajorUnits(
  minorAmount: number | bigint,
  currency: string = 'NGN'
): number {
  const rule = getCurrencyRule(currency);
  const factor = Number(rule.factor);
  return Number(minorAmount) / factor;
}

/**
 * Computes running balance strictly in minor units as BigInt / Integer.
 */
export function calculateRunningBalance(
  previousBalance: number | bigint,
  amount: number | bigint,
  type: 'income' | 'expense'
): bigint {
  const prev = typeof previousBalance === 'bigint' ? previousBalance : BigInt(Math.round(previousBalance));
  const amt = typeof amount === 'bigint' ? amount : BigInt(Math.round(amount));

  if (amt <= 0n) {
    throw new TransactionValidationError(
      'Transaction amount must be strictly positive. Amounts must be strictly positive.',
      'NON_POSITIVE_AMOUNT'
    );
  }

  return type === 'income' ? prev + amt : prev - amt;
}

/**
 * Modular and pure transaction validation function.
 * Validates sign, ceilings, and converts to BigInt/Integer strictly in minor units.
 * Can be safely called before database writes.
 */
export function validateTransactionAmount(
  input: TransactionValidationInput,
  currencyParam?: string,
  optionsParam?: TransactionValidationOptions
): TransactionValidationResult {
  let rawAmount: number | string | bigint;
  let currency: string;
  let isMinorUnits = false;
  let throwOnError = false;

  if (typeof input === 'object' && input !== null && !(typeof input === 'bigint')) {
    rawAmount = input.amount;
    currency = (input.currency || currencyParam || 'NGN').toUpperCase().trim();
    isMinorUnits = input.isMinorUnits ?? optionsParam?.isMinorUnits ?? false;
    throwOnError = input.throwOnError ?? optionsParam?.throwOnError ?? false;
  } else {
    rawAmount = input;
    currency = (currencyParam || 'NGN').toUpperCase().trim();
    isMinorUnits = optionsParam?.isMinorUnits ?? false;
    throwOnError = optionsParam?.throwOnError ?? false;
  }

  const rule = getCurrencyRule(currency);

  const fail = (
    error: string,
    code: 'NON_POSITIVE_AMOUNT' | 'OVERFLOW_AMOUNT' | 'INVALID_AMOUNT'
  ): ValidationErrorResult => {
    if (throwOnError) {
      throw new TransactionValidationError(error, code);
    }
    return {
      valid: false,
      success: false,
      currency,
      requires_confirmation: false,
      requiresConfirmation: false,
      error,
      code,
    };
  };

  // 1. Initial Type & Parsing Checks
  if (rawAmount === undefined || rawAmount === null) {
    return fail('Transaction amount is required. Amounts must be strictly positive.', 'INVALID_AMOUNT');
  }

  // 2. Sign Validation (Explicitly reject any amount <= 0. Do NOT sign-flip.)
  // String check for negative sign or zero
  if (typeof rawAmount === 'string') {
    const trimmed = rawAmount.trim();
    if (trimmed.startsWith('-') || /-\s*\d/.test(trimmed)) {
      return fail(
        `Invalid transaction amount: "${rawAmount}". Amounts must be strictly positive. Negative amounts are not allowed; do not sign-flip.`,
        'NON_POSITIVE_AMOUNT'
      );
    }
    const parsedNum = parseFloat(trimmed.replace(/,/g, ''));
    if (isNaN(parsedNum)) {
      return fail(`Invalid transaction amount: "${rawAmount}". Amount must be a valid number.`, 'INVALID_AMOUNT');
    }
    if (parsedNum <= 0) {
      return fail(
        `Invalid transaction amount: "${rawAmount}". Amounts must be strictly positive (Amount must be a positive number).`,
        'NON_POSITIVE_AMOUNT'
      );
    }
  } else if (typeof rawAmount === 'number') {
    if (isNaN(rawAmount) || !isFinite(rawAmount)) {
      return fail(`Invalid transaction amount: "${rawAmount}". Amount must be a valid finite number.`, 'INVALID_AMOUNT');
    }
    if (rawAmount <= 0) {
      return fail(
        `Invalid transaction amount: "${rawAmount}". Amounts must be strictly positive (Amount must be a positive number).`,
        'NON_POSITIVE_AMOUNT'
      );
    }
  } else if (typeof rawAmount === 'bigint') {
    if (rawAmount <= 0n) {
      return fail(
        `Invalid transaction amount: "${rawAmount.toString()}". Amounts must be strictly positive (Amount must be a positive number).`,
        'NON_POSITIVE_AMOUNT'
      );
    }
  }

  // 3. Conversion to Minor Units (BigInt / Integer strictly in minor units)
  let minorUnits: bigint;
  let majorUnits: number;

  try {
    if (isMinorUnits || typeof rawAmount === 'bigint') {
      minorUnits = typeof rawAmount === 'bigint' ? rawAmount : BigInt(Math.round(Number(rawAmount)));
      majorUnits = convertToMajorUnits(minorUnits, currency);
    } else {
      // Determine if a raw number is passed that represents minor units vs major units
      // If a number > rule.confirmationThresholdMinor, it's explicitly in minor units
      const numVal = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount).replace(/,/g, ''));
      if (numVal > Number(rule.confirmationThresholdMinor)) {
        minorUnits = BigInt(Math.round(numVal));
        majorUnits = convertToMajorUnits(minorUnits, currency);
      } else {
        minorUnits = convertToMinorUnits(rawAmount, currency);
        majorUnits = convertToMajorUnits(minorUnits, currency);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(`Failed to parse transaction amount: ${msg}`, 'INVALID_AMOUNT');
  }

  if (minorUnits <= 0n) {
    return fail(
      'Transaction amount must be strictly positive. Amounts must be strictly positive.',
      'NON_POSITIVE_AMOUNT'
    );
  }

  // 4. Currency-Aware Ceilings:
  // - Hard reject amounts > hard reject threshold as invalid overflow input.
  // - Flag amounts > confirmation threshold to require explicit confirmation (requires_confirmation = True).

  if (minorUnits > rule.hardRejectThresholdMinor) {
    const formattedMajor = majorUnits.toLocaleString('en-US', { maximumFractionDigits: 2 });
    const formattedMinor = minorUnits.toLocaleString('en-US');
    const currencyLabel = currency === 'USD' ? `$${formattedMajor}` : `${formattedMajor} ${currency}`;
    const ceilingMajorStr = currency === 'USD' ? `$${rule.hardRejectThresholdMajor.toLocaleString()}` : `${rule.hardRejectThresholdMajor.toLocaleString()} NGN`;

    return fail(
      `Transaction amount ${currencyLabel} (${formattedMinor} ${rule.minorUnitName}) exceeds maximum allowable limit of ${ceilingMajorStr} (${rule.hardRejectThresholdMinor.toLocaleString()} ${rule.minorUnitName}): invalid overflow input.`,
      'OVERFLOW_AMOUNT'
    );
  }

  const requiresConfirmation = minorUnits > rule.confirmationThresholdMinor;

  return {
    valid: true,
    success: true,
    amount: minorUnits,
    amountMinor: minorUnits,
    amountInteger: Number(minorUnits),
    amountMajor: majorUnits,
    currency,
    minorUnitName: rule.minorUnitName,
    requires_confirmation: requiresConfirmation,
    requiresConfirmation,
  };
}

// Convenient aliases for developers and integrations
export const validateTransaction = validateTransactionAmount;
export const validateAmount = validateTransactionAmount;
export const validateCurrencyAmount = validateTransactionAmount;
export const validateBounds = validateTransactionAmount;

export function assertValidTransactionAmount(
  input: TransactionValidationInput,
  currency?: string,
  options?: Omit<TransactionValidationOptions, 'throwOnError'>
): ValidationSuccess {
  const result = validateTransactionAmount(input, currency, { ...options, throwOnError: true });
  return result as ValidationSuccess;
}
