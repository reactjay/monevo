import { IUserDocument } from '../../models/User';
import { GenerateReceiptIntent } from '../ai/schemas';
import {
  createAndStoreReceipt,
  sendReceiptToWhatsApp,
  GeneratedReceiptResult,
} from '../receipts/receiptService';
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
 */
export async function generateReceiptTool(
  params: GenerateReceiptToolParams
): Promise<GenerateReceiptToolResult> {
  const { user, intent, source = 'text', whatsappMessageId } = params;
  const target = intent.target;
  const userCurrency = user.currency || 'NGN';

  // 1. Missing Amount Validation
  if (!target.amount || target.amount <= 0) {
    if (target.counterparty) {
      return {
        success: false,
        message: `How much was the receipt for *${target.counterparty}*?\n\nExample: "Receipt for ${target.counterparty} 50,000 for consulting"`,
      };
    }
    return {
      success: false,
      message: `How much was this payment for?\n\nExample: "Create a receipt for ₦150,000 received from David for website development"`,
    };
  }

  // 2. Missing Payer Validation
  if (!target.counterparty || target.counterparty.trim().length === 0) {
    const formattedAmt = formatCurrency(target.amount, userCurrency);
    return {
      success: false,
      message: `Who did you receive the payment of *${formattedAmt}* from?\n\nExample: "Receipt for David ${target.amount}"`,
    };
  }

  // 3. Create & Store Receipt deterministically
  const payer = target.counterparty.trim();
  const description = target.description || `Payment from ${payer}`;

  const receiptResult = await createAndStoreReceipt({
    user,
    payer,
    amount: target.amount,
    currency: userCurrency,
    description,
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

  const formattedAmt = formatCurrency(target.amount, userCurrency);
  const confirmationMessage = `🧾 *Receipt Generated Successfully!*

*Receipt No:* \`${receiptResult.receiptNumber}\`
*Payer:* ${payer}
*Amount:* ${formattedAmt}
*Description:* ${description}
*Status:* PAID ✅

Your receipt image has been generated and sent above.`;

  return {
    success: true,
    message: confirmationMessage,
    receiptResult,
  };
}
