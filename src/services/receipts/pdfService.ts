import PDFDocument from 'pdfkit';
import { ReceiptTemplateData } from './receiptTemplate';
import {
  sanitizeReceiptInput,
  sanitizePayerName,
  sanitizeDescription,
  sanitizePromptInjection,
} from './receiptSanitizer';

export interface GeneratePdfOptions {
  compress?: boolean;
  isInvoice?: boolean;
  status?: string;
}

/**
 * Generates an Enterprise Vector PDF Document for a receipt or invoice.
 *
 * Requirements:
 * 1. Clean, professional layout including:
 *    - Business/User Header
 *    - Receipt/Invoice Number/ID
 *    - Date & Time (and optional Due Date)
 *    - Payer / Client Name
 *    - Itemized Description & Payment Channel
 *    - Amount properly formatted with currency symbol
 *    - Status badge ("PAID", "PENDING", "INVOICE / QUOTATION", "OVERDUE")
 * 2. Privacy & PII Protection:
 *    - Strictly adheres to include_contact_phone (omits phone number if false or undefined).
 *    - Omits contact phone from both the visual stream and the PDF metadata dictionary.
 * 3. Input Sanitization:
 *    - Consumes sanitizeReceiptInput and prompt injection sanitizers to prevent injection
 *      or control character breaks.
 * 4. Invoice & Quotation Extension:
 *    - Supports isInvoice and status option to display "INVOICE / QUOTATION" or "PENDING"
 *      instead of "PAID".
 */
export async function generateReceiptPdf(
  receiptData: ReceiptTemplateData,
  options: GeneratePdfOptions = {}
): Promise<Buffer> {
  const isInvoice = Boolean(options.isInvoice ?? receiptData.isInvoice);

  // 1. Strict Input Sanitization & Boundary Protection
  const rawPayer = receiptData.payer || 'Valued Customer';
  const rawDesc = receiptData.description || 'General payment';

  const sanitized = sanitizeReceiptInput(
    {
      payer_name: rawPayer,
      amount: receiptData.amount,
      description: rawDesc,
      currency: receiptData.currency,
      date: receiptData.date,
    },
    receiptData.currency
  );

  const safePayer = sanitized.payer;
  const safeDescription = sanitized.description;
  const safeRecipient = sanitizePayerName(
    receiptData.isBusiness
      ? receiptData.businessName || receiptData.recipientName || 'Merchant'
      : receiptData.recipientName || 'Account Holder',
    'Merchant'
  );
  const safeBusinessName = receiptData.businessName
    ? sanitizePayerName(receiptData.businessName, '')
    : '';
  const safeBusinessAddress = receiptData.businessAddress
    ? sanitizeDescription(receiptData.businessAddress, '')
    : '';
  const safeReceiptNumber = sanitizePromptInjection(receiptData.receiptNumber || (isInvoice ? 'INV-UNKNOWN' : 'REC-UNKNOWN'));
  const safeDate = sanitizePromptInjection(receiptData.date || new Date().toISOString().split('T')[0]);
  const safeTime = receiptData.time ? sanitizePromptInjection(receiptData.time) : '';

  // Determine status & badge
  let resolvedStatus = 'PAID';
  if (options.status) {
    resolvedStatus = options.status;
  } else if (receiptData.status && receiptData.status !== 'PAID') {
    resolvedStatus = receiptData.status;
  } else if (isInvoice) {
    resolvedStatus = 'INVOICE / QUOTATION';
  } else if (receiptData.status) {
    resolvedStatus = receiptData.status;
  }

  const safeStatus = sanitizePromptInjection(resolvedStatus.toUpperCase());
  const formattedAmount = sanitizePromptInjection(
    receiptData.formattedAmount || `${receiptData.currency || 'NGN'} ${receiptData.amount}`
  );

  // 2. Privacy Check: Strict PII Phone Guard
  const shouldIncludePhone =
    receiptData.include_contact_phone === true || receiptData.includeContactPhone === true;
  const rawPhone = receiptData.isBusiness
    ? receiptData.businessPhone || receiptData.userPhone || ''
    : receiptData.userPhone || '';
  const safePhone = shouldIncludePhone && rawPhone ? sanitizePromptInjection(rawPhone) : '';

  // 3. Vector PDF Generation using PDFKit
  return new Promise<Buffer>((resolve, reject) => {
    try {
      // By default compress is false so vector text stream is easily verifiable and indexable
      const compress = options.compress ?? false;

      const doc = new PDFDocument({
        size: 'A4', // 595.28 x 841.89 points
        margin: 48,
        compress,
        info: {
          Title: isInvoice ? `Invoice - ${safeReceiptNumber}` : `Receipt - ${safeReceiptNumber}`,
          Author: safeRecipient,
          Subject: isInvoice ? `Invoice ${safeReceiptNumber}` : `Payment Receipt ${safeReceiptNumber}`,
          Creator: 'Monevo Vector Engine',
          Producer: 'Monevo AI Financial Assistant',
          // Strictly avoid putting phone in metadata dictionary when not authorized
          ...(shouldIncludePhone && safePhone ? { Keywords: `Phone: ${safePhone}` } : {}),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const MARGIN_LEFT = 48;
      const MARGIN_RIGHT = 547;
      const CONTENT_WIDTH = MARGIN_RIGHT - MARGIN_LEFT; // ~499 points

      // ── Header Section ──────────────────────────────────────────────
      const brandHeader = receiptData.isBusiness && safeBusinessName ? safeBusinessName : 'MONEVO';
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#0F172A').text(brandHeader, MARGIN_LEFT, 48);

      const headerSubtitle = isInvoice ? 'OFFICIAL INVOICE / QUOTATION' : 'OFFICIAL TRANSACTION RECEIPT';
      doc
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .fillColor('#64748B')
        .text(headerSubtitle, MARGIN_LEFT, 74, { characterSpacing: 1.5 });

      // ── Status Badge ("PAID", "PENDING", "INVOICE / QUOTATION", "OVERDUE") ────
      let badgeBg = '#DCFCE7';
      let badgeColor = '#16A34A';

      if (safeStatus.includes('PENDING')) {
        badgeBg = '#FEF3C7';
        badgeColor = '#D97706';
      } else if (safeStatus.includes('OVERDUE')) {
        badgeBg = '#FEE2E2';
        badgeColor = '#DC2626';
      } else if (safeStatus.includes('INVOICE') || safeStatus.includes('QUOTATION')) {
        badgeBg = '#DBEAFE';
        badgeColor = '#1D4ED8';
      } else if (safeStatus === 'PAID') {
        badgeBg = '#DCFCE7';
        badgeColor = '#16A34A';
      }

      const badgeFontSize = safeStatus.length > 12 ? 8.5 : 11;
      const badgeW = Math.max(86, Math.min(180, safeStatus.length * 8 + 20));
      const badgeH = 26;
      const badgeX = MARGIN_RIGHT - badgeW;
      const badgeY = 48;
      doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 6).fillColor(badgeBg).fill();
      doc
        .fontSize(badgeFontSize)
        .font('Helvetica-Bold')
        .fillColor(badgeColor)
        .text(safeStatus, badgeX, badgeY + (badgeFontSize < 10 ? 8 : 7), { width: badgeW, align: 'center' });

      // ── Top Separator Line ──────────────────────────────────────────
      let currentY = 98;
      doc.moveTo(MARGIN_LEFT, currentY).lineTo(MARGIN_RIGHT, currentY).strokeColor('#E2E8F0').lineWidth(1).stroke();

      currentY += 18;

      // ── Metadata Block (Receipt/Invoice No, Date, Merchant, Payer) ──
      const col1X = MARGIN_LEFT;
      const col2X = MARGIN_LEFT + 260;

      // Left Column: Metadata
      const numberLabel = isInvoice ? 'INVOICE NUMBER' : 'RECEIPT NUMBER';
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B').text(numberLabel, col1X, currentY, { characterSpacing: 1 });
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0F172A').text(safeReceiptNumber, col1X, currentY + 12);

      const dateLabel = isInvoice && receiptData.dueDate ? 'DATE ISSUED' : 'DATE ISSUED';
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B').text(dateLabel, col1X, currentY + 34, { characterSpacing: 1 });
      const fullDateStr = safeTime ? `${safeDate} • ${safeTime}` : safeDate;
      doc.fontSize(10).font('Helvetica').fillColor('#1E293B').text(fullDateStr, col1X, currentY + 46);

      let leftColExtraY = currentY + 46;
      if (isInvoice && receiptData.dueDate) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B').text('DUE DATE', col1X, currentY + 68, { characterSpacing: 1 });
        doc.fontSize(10).font('Helvetica').fillColor('#1E293B').text(receiptData.dueDate, col1X, currentY + 80);
        leftColExtraY = currentY + 80;
      }

      // Right Column: Issuer / Merchant
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B').text('ISSUED BY', col2X, currentY, { characterSpacing: 1 });
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#0F172A').text(safeRecipient, col2X, currentY + 12);

      let rightColExtraY = currentY + 34;
      if (shouldIncludePhone && safePhone) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B').text('CONTACT', col2X, rightColExtraY, { characterSpacing: 1 });
        doc.fontSize(10).font('Helvetica').fillColor('#1E293B').text(safePhone, col2X, rightColExtraY + 12);
        rightColExtraY += 30;
      }

      if (safeBusinessAddress) {
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B').text('ADDRESS', col2X, rightColExtraY, { characterSpacing: 1 });
        doc.fontSize(9.5).font('Helvetica').fillColor('#1E293B').text(safeBusinessAddress, col2X, rightColExtraY + 12, { width: 230 });
      }

      currentY = Math.max(currentY + 76, leftColExtraY + 24, rightColExtraY + 24);

      // ── Payer / Client Section ──────────────────────────────────────
      doc.moveTo(MARGIN_LEFT, currentY).lineTo(MARGIN_RIGHT, currentY).strokeColor('#F1F5F9').lineWidth(1).stroke();
      currentY += 14;

      const payerLabel = isInvoice ? 'BILL TO / CLIENT' : 'RECEIVED FROM';
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#64748B').text(payerLabel, col1X, currentY, { characterSpacing: 1 });
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0F172A').text(safePayer, col1X, currentY + 13);

      currentY += 42;

      // ── Itemized Details Table ───────────────────────────────────────
      const tableHeaderY = currentY;
      doc.rect(MARGIN_LEFT, tableHeaderY, CONTENT_WIDTH, 26).fillColor('#F8FAFC').fill();
      doc.rect(MARGIN_LEFT, tableHeaderY, CONTENT_WIDTH, 26).strokeColor('#E2E8F0').lineWidth(1).stroke();

      doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#475569');
      doc.text('DESCRIPTION', MARGIN_LEFT + 14, tableHeaderY + 8);
      doc.text(isInvoice ? 'PAYMENT TERMS' : 'PAYMENT CHANNEL', MARGIN_LEFT + 280, tableHeaderY + 8);
      doc.text('AMOUNT', MARGIN_LEFT + 410, tableHeaderY + 8, { width: 80, align: 'right' });

      currentY += 34;

      // Table Row
      doc.fontSize(10).font('Helvetica').fillColor('#0F172A');
      doc.text(safeDescription, MARGIN_LEFT + 14, currentY, { width: 250 });
      doc.text(isInvoice ? 'Upon Receipt' : 'Cash / Transfer', MARGIN_LEFT + 280, currentY);
      doc.font('Helvetica-Bold').text(formattedAmount, MARGIN_LEFT + 390, currentY, { width: 100, align: 'right' });

      currentY += 48;

      // ── Total Summary Card ───────────────────────────────────────────
      const cardY = currentY;
      const cardH = 74;
      doc.roundedRect(MARGIN_LEFT, cardY, CONTENT_WIDTH, cardH, 8).fillColor('#F8FAFC').fill();
      doc.roundedRect(MARGIN_LEFT, cardY, CONTENT_WIDTH, cardH, 8).strokeColor('#E2E8F0').lineWidth(1).stroke();

      const totalLabel = isInvoice && safeStatus !== 'PAID' ? 'TOTAL AMOUNT DUE' : 'TOTAL AMOUNT PAID';
      doc
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .fillColor('#64748B')
        .text(totalLabel, MARGIN_LEFT + 16, cardY + 14, { characterSpacing: 1 });

      doc
        .fontSize(22)
        .font('Helvetica-Bold')
        .fillColor('#0F172A')
        .text(formattedAmount, MARGIN_LEFT + 16, cardY + 32);

      const statusSummaryText = isInvoice
        ? (safeStatus === 'PAID' ? 'STATUS: PAID & SETTLED' : `STATUS: ${safeStatus}`)
        : 'STATUS: COMPLETED & VERIFIED';

      const statusSummaryColor = safeStatus === 'PAID' ? '#16A34A' : safeStatus.includes('OVERDUE') ? '#DC2626' : '#2563EB';
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(statusSummaryColor)
        .text(statusSummaryText, MARGIN_LEFT + 280, cardY + 38, { width: 210, align: 'right' });

      currentY += cardH + 40;

      // ── Footer & Security Audit Note ─────────────────────────────────
      doc.moveTo(MARGIN_LEFT, currentY).lineTo(MARGIN_RIGHT, currentY).strokeColor('#E2E8F0').lineWidth(1).stroke();
      currentY += 16;

      const docTypeWord = isInvoice ? 'invoice / quotation' : 'receipt';
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#94A3B8')
        .text(`This is an electronically generated official ${docTypeWord} issued via Monevo AI Financial Assistant.`, MARGIN_LEFT, currentY, { align: 'center', width: CONTENT_WIDTH });

      const refPrefix = isInvoice ? 'Invoice' : 'Receipt';
      doc
        .fontSize(7.5)
        .font('Helvetica')
        .fillColor('#94A3B8')
        .text(`${refPrefix} Reference: ${safeReceiptNumber} • Deterministic Vector Document`, MARGIN_LEFT, currentY + 13, { align: 'center', width: CONTENT_WIDTH });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export interface InvoicePdfData {
  invoiceNumber?: string;
  clientName: string;
  clientPhone?: string;
  amount: number;
  formattedAmount?: string;
  currency?: string;
  description?: string;
  dueDate?: Date | string;
  date?: string;
  time?: string;
  merchantName?: string;
  businessName?: string;
  businessAddress?: string;
  businessPhone?: string;
  isBusiness?: boolean;
  status?: string;
  include_contact_phone?: boolean;
}

/**
 * Generates an Enterprise Vector PDF Document for an invoice or quotation.
 */
export async function generateInvoicePdf(
  invoiceData: InvoicePdfData,
  options: GeneratePdfOptions = {}
): Promise<Buffer> {
  const currency = (invoiceData.currency || 'NGN').toUpperCase().trim();
  const rawAmount = invoiceData.amount;
  const isMinorUnits = Number.isInteger(rawAmount) && rawAmount >= 100 && !invoiceData.formattedAmount;
  const majorAmount = isMinorUnits ? rawAmount / 100 : rawAmount;
  const formattedAmount =
    invoiceData.formattedAmount ||
    (currency === 'NGN'
      ? `₦${majorAmount.toLocaleString('en-US')}`
      : `${currency} ${majorAmount.toLocaleString('en-US')}`);

  const formattedDueDate = invoiceData.dueDate
    ? typeof invoiceData.dueDate === 'string'
      ? invoiceData.dueDate
      : invoiceData.dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : undefined;

  const templateData: ReceiptTemplateData = {
    receiptNumber: invoiceData.invoiceNumber || `INV-${Date.now().toString(36).toUpperCase()}`,
    date:
      invoiceData.date ||
      new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: invoiceData.time,
    payer: invoiceData.clientName,
    recipientName: invoiceData.merchantName || invoiceData.businessName || 'Merchant',
    isBusiness: invoiceData.isBusiness ?? Boolean(invoiceData.businessName),
    businessName: invoiceData.businessName,
    businessAddress: invoiceData.businessAddress,
    businessPhone: invoiceData.businessPhone,
    userPhone: invoiceData.clientPhone,
    include_contact_phone: invoiceData.include_contact_phone,
    amount: rawAmount,
    formattedAmount,
    currency,
    description: invoiceData.description || 'Professional Services / Goods',
    status: options.status || invoiceData.status || 'INVOICE / QUOTATION',
    isInvoice: true,
    dueDate: formattedDueDate,
  };

  return generateReceiptPdf(templateData, { ...options, isInvoice: true });
}

