import crypto from 'crypto';
import sharp from 'sharp';
import { Types } from 'mongoose';
import { IUserDocument } from '../../models/User';
import { Receipt, IReceiptDocument } from '../../models/Receipt';
import { Transaction, ITransactionDocument } from '../../models/Transaction';
import { generateReceiptSvg, ReceiptTemplateData } from './receiptTemplate';
import { generateReceiptPdf } from './pdfService';
import { sanitizeReceiptInput } from './receiptSanitizer';
import { formatCurrency } from '../tools/formatters';
import { uploadMedia, sendImageMessage } from '../whatsapp/client';

export interface CreateReceiptParams {
  user: IUserDocument;
  payer?: string;
  payer_name?: string;
  amount: number;
  currency?: string;
  description?: string;
  notes?: string;
  transactionId?: Types.ObjectId;
  source?: 'text' | 'voice';
  whatsappMessageId?: string;
  issuedAt?: Date;
  date?: string | Date;
  include_contact_phone?: boolean;
}

export interface GeneratedReceiptResult {
  receipt: IReceiptDocument;
  receiptNumber: string;
  pngBuffer: Buffer;
  pdfBuffer?: Buffer;
  svg: string;
  mediaId?: string;
}

/**
 * Generates a unique, standardized receipt number.
 * Format: REC-YYYYMMDD-XXXX (e.g., REC-20260911-A8F2)
 */
export function generateReceiptNumber(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const randomSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `REC-${year}${month}${day}-${randomSuffix}`;
}

/**
 * Deterministically converts an SVG receipt string to a high-quality PNG Buffer using Sharp.
 */
export async function renderReceiptPng(svgString: string): Promise<Buffer> {
  return sharp(Buffer.from(svgString))
    .png({ quality: 95, compressionLevel: 9 })
    .toBuffer();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a date for the receipt header (e.g., "11 Sep 2026").
 */
export function formatReceiptDate(date: Date = new Date()): string {
  const day = date.getDate();
  const month = MONTHS[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Orchestrates receipt creation:
 * 1. Resolves/creates associated transaction in MongoDB
 * 2. Generates unique receipt number
 * 3. Builds deterministic SVG & renders PNG via Sharp
 * 4. Saves Receipt record in MongoDB
 * 5. Optionally uploads media to Meta WhatsApp API and sends to user
 */
export async function createAndStoreReceipt(
  params: CreateReceiptParams
): Promise<GeneratedReceiptResult> {
  const { user, source = 'text', whatsappMessageId } = params;

  const rawPayer = params.payer_name || params.payer;
  if (!rawPayer || !rawPayer.trim()) {
    throw new Error('Receipt payer name is required');
  }

  const rawAmount = params.amount;
  if (!rawAmount || rawAmount <= 0) {
    throw new Error('Receipt amount must be greater than zero');
  }

  // 1. Strict Input Sanitization & Boundary Enforcement (Issue #19)
  const sanitized = sanitizeReceiptInput(
    {
      payer_name: rawPayer,
      amount: rawAmount,
      description: params.description || params.notes,
      currency: params.currency || user.currency,
      date: params.issuedAt || params.date,
    },
    user.currency
  );

  const payer = sanitized.payer;
  const description = sanitized.description;
  const amount = sanitized.amount;
  const currency = sanitized.currency;
  const issuedAt = sanitized.date;

  // 2. Resolve or create associated income Transaction
  let transactionId = params.transactionId;
  if (!transactionId) {
    // Try to find a recent matching income transaction within last 24h
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingTx: ITransactionDocument | null = await Transaction.findOne({
      userId: user._id,
      type: 'income',
      amount,
      currency: currency.toUpperCase(),
      createdAt: { $gte: oneDayAgo },
    }).sort({ createdAt: -1 });

    if (existingTx) {
      transactionId = existingTx._id;
    } else {
      // Create corresponding income transaction so accounting remains intact
      const newTx: ITransactionDocument = await Transaction.create({
        userId: user._id,
        type: 'income',
        amount,
        currency: currency.toUpperCase(),
        category: 'payment',
        description,
        counterparty: payer,
        date: issuedAt,
        source,
        whatsappMessageId,
      });
      transactionId = newTx._id;
    }
  }

  // 2. Generate unique receipt number
  let receiptNumber = generateReceiptNumber(issuedAt);
  // Ensure uniqueness in DB if collision occurs
  let isUnique = false;
  while (!isUnique) {
    const existing = await Receipt.findOne({ receiptNumber });
    if (!existing) {
      isUnique = true;
    } else {
      receiptNumber = generateReceiptNumber(issuedAt);
    }
  }

  // 3. Prepare Template Data
  const formattedAmount = formatCurrency(amount, currency.toUpperCase());
  const isBusiness = user.profileType === 'business';

  const recipientName = isBusiness
    ? user.businessName || user.name || 'Merchant'
    : user.name || 'Account Holder';

  const shouldIncludeContactPhone = params.include_contact_phone !== undefined
    ? Boolean(params.include_contact_phone)
    : Boolean(user.include_phone_on_receipts);

  const templateData: ReceiptTemplateData = {
    receiptNumber,
    date: formatReceiptDate(issuedAt),
    payer: payer.trim(),
    recipientName,
    isBusiness,
    businessName: user.businessName,
    businessPhone: user.phone,
    businessAddress: user.businessAddress,
    userPhone: user.phone || user.whatsappId,
    include_contact_phone: shouldIncludeContactPhone,
    includeContactPhone: shouldIncludeContactPhone,
    amount,
    formattedAmount,
    currency: currency.toUpperCase(),
    description,
    status: 'PAID',
  };

  // 4. Generate deterministic SVG, render PNG buffer, and generate Vector PDF
  const svg = generateReceiptSvg(templateData);
  const pngBuffer = await renderReceiptPng(svg);
  const pdfBuffer = await generateReceiptPdf(templateData);

  // 5. Save Receipt document in MongoDB
  const receipt = await Receipt.create({
    userId: user._id,
    transactionId,
    receiptNumber,
    payer: payer.trim(),
    recipient: templateData.recipientName,
    amount,
    currency: currency.toUpperCase(),
    description,
    issuedAt,
  });

  return {
    receipt,
    receiptNumber,
    pngBuffer,
    pdfBuffer,
    svg,
  };
}

/**
 * Generates and sends a receipt directly to the user's WhatsApp.
 */
export async function sendReceiptToWhatsApp(
  user: IUserDocument,
  receiptResult: GeneratedReceiptResult
): Promise<string> {
  const { receiptNumber, pngBuffer, receipt } = receiptResult;
  const filename = `${receiptNumber}.png`;

  // Upload PNG media to Meta Graph API
  const mediaId = await uploadMedia(pngBuffer, 'image/png', filename);

  // Store media reference on the receipt record
  receipt.mediaReference = mediaId;
  await receipt.save();

  const caption = `🧾 *Receipt ${receiptNumber}*\nAmount: ${formatCurrency(
    receipt.amount,
    receipt.currency
  )}\nStatus: PAID ✅`;

  // Send image message with caption to user
  await sendImageMessage(user.whatsappId, mediaId, caption);

  return mediaId;
}

export { generateReceiptPdf, generateInvoicePdf } from './pdfService';


