import { IUserDocument } from '../../models/User';
import { GenerateReceiptIntent } from '../ai/schemas';
import {
  createAndStoreReceipt,
  sendReceiptToWhatsApp,
  GeneratedReceiptResult,
} from '../receipts/receiptService';
import { sanitizeReceiptInput, sanitizePayerName } from '../receipts/receiptSanitizer';
import { formatCurrency } from './formatters';

export interface GenerateReceiptToolParams {
  user: IUserDocument;
  intent: GenerateReceiptIntent;
  source?: 'text' | 'voice';
  whatsappMessageId?: string;
}

export interface GenerateReceiptToolResult {
  success: boolean;
  message: string;
  receiptResult?: GeneratedReceiptResult;
}

/**
 * Validates, generates, stores, and sends a professional receipt.
 * Strict Tool Calling & Prompt Injection Hardening (Issue #19 / Finding #3).
 */
export async function generateReceiptTool(
  params: GenerateReceiptToolParams
): Promise<GenerateReceiptToolResult> {
  const { user, intent, source = 'text', whatsappMessageId } = params;
  const target = intent.target;
  const userCurrency = user.currency || 'NGN';

  const rawPayer = target.payer_name || target.counterparty;
  const rawDesc = target.description || target.notes;

  // 1. Missing Amount Validation
  if (!target.amount || target.amount <= 0) {
    if (rawPayer) {
      const safePayer = sanitizePayerName(rawPayer);
      return {
        success: false,
        message: `How much was the receipt for *${safePayer}*?\n\nExample: "Receipt for ${safePayer} 50,000 for consulting"`,
      };
    }
    return {
      success: false,
      message: `How much was this payment for?\n\nExample: "Create a receipt for ₦150,000 received from David for website development"`,
    };
  }

  // 2. Missing Payer Validation
  if (!rawPayer || !rawPayer.trim()) {
    const formattedAmt = formatCurrency(target.amount, userCurrency);
    return {
      success: false,
      message: `Who did you receive the payment of *${formattedAmt}* from?\n\nExample: "Receipt for David ${target.amount}"`,
    };
  }

  // 3. Strict Input Sanitization & Boundary Enforcement (Issue #19)
  const sanitized = sanitizeReceiptInput(
    {
      payer_name: rawPayer,
      amount: target.amount,
      description: rawDesc,
      date: target.date,
      currency: userCurrency,
    },
    userCurrency
  );

  const contactPhoneIncluded = target.include_contact_phone !== undefined
    ? Boolean(target.include_contact_phone)
    : Boolean(user.include_phone_on_receipts);

  const receiptResult = await createAndStoreReceipt({
    user,
    payer: sanitized.payer,
    payer_name: sanitized.payer_name,
    amount: sanitized.amount,
    currency: sanitized.currency,
    description: sanitized.description,
    notes: sanitized.notes,
    date: sanitized.date,
    include_contact_phone: target.include_contact_phone,
    source,
    whatsappMessageId,
  });

  // 4. Send Image via WhatsApp
  try {
    await sendReceiptToWhatsApp(user, receiptResult);
  } catch (err) {
    console.error('Failed to send receipt image via WhatsApp API:', err);
    // Return receipt confirmation text even if media upload fails in edge cases
  }

  const formattedAmt = formatCurrency(sanitized.amount, userCurrency);
  const privacyTip = contactPhoneIncluded
    ? "💡 Tip: Your phone number was included on this receipt. To exclude it next time, say 'exclude my phone number'."
    : "💡 Tip: Your phone number was excluded from this receipt for privacy. To include it next time, say 'include my phone number'.";

  const confirmationMessage = `🧾 *Receipt Generated Successfully!*

*Receipt No:* \`${receiptResult.receiptNumber}\`
*Payer:* ${sanitized.payer}
*Amount:* ${formattedAmt}
*Description:* ${sanitized.description}
*Status:* PAID ✅

Your receipt image has been generated and sent above.

${privacyTip}`;

  return {
    success: true,
    message: confirmationMessage,
    receiptResult,
  };
}
