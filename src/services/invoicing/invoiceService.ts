import { Types } from 'mongoose';
import { IInvoice, InvoiceStatus } from '../../types/models';
import { Invoice, IInvoiceDocument } from '../../models/Invoice';
import { formatCurrency } from '../tools/formatters';
import { convertToMajorUnits } from '../tools/transactionValidator';
import { generateInvoicePdf, generateReceiptPdf, GeneratePdfOptions, InvoicePdfData } from '../receipts/pdfService';

export interface CreateInvoiceInput {
  userId: Types.ObjectId | string;
  clientName: string;
  clientPhone?: string;
  amount: number; // integer minor units
  currency?: string;
  description?: string;
  dueDate: Date | string;
  status?: InvoiceStatus;
  invoiceNumber?: string;
}

/**
 * Generates a clean, unique invoice number.
 * Format: INV-YYYYMMDD-XXXX
 */
export function generateInvoiceNumber(date: Date = new Date()): string {
  const yyyymmdd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${yyyymmdd}-${rand}`;
}

/**
 * Formats a Date object or ISO string into a human-friendly format (e.g., "15 Oct 2026").
 */
export function formatInvoiceDueDate(dueDate: Date | string): string {
  const d = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  if (isNaN(d.getTime())) return String(dueDate);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Returns formatted currency amount from minor units.
 */
export function getInvoiceFormattedAmount(
  invoice: Pick<IInvoice, 'amount'> & { currency?: string; formattedAmount?: string }
): string {
  if (invoice.formattedAmount) return invoice.formattedAmount;
  const currency = invoice.currency || 'NGN';
  const major = convertToMajorUnits(invoice.amount, currency);
  return formatCurrency(major, currency);
}

/**
 * Generates automated WhatsApp debt reminder messages for merchants.
 *
 * Requirements:
 * - 'gentle': Polite check-in ("Hi [Name], friendly reminder regarding invoice #[ID] for [Amount] due on [Date]...").
 * - 'firm': Clear payment due notice with professional, non-aggressive tone.
 */
export function generateDebtReminderMessage(
  invoice: IInvoice,
  stage: 'gentle' | 'firm'
): string {
  const clientName = invoice.clientName?.trim() || 'there';
  const invoiceWithId = invoice as IInvoice & { _id?: Types.ObjectId | string };
  const rawId =
    invoice.invoiceNumber ||
    (invoiceWithId._id ? String(invoiceWithId._id) : 'INV');
  const cleanId = rawId.replace(/^#+/, '');
  const formattedAmount = getInvoiceFormattedAmount(invoice);
  const formattedDueDate = formatInvoiceDueDate(invoice.dueDate);

  if (stage === 'gentle') {
    return (
      `Hi ${clientName}, friendly reminder regarding invoice #${cleanId} for ${formattedAmount} ` +
      `due on ${formattedDueDate}. Please let us know if you have any questions or once payment has been made. Thank you!`
    );
  }

  // stage === 'firm'
  return (
    `Hi ${clientName}, this is a payment due notice for invoice #${cleanId} for ${formattedAmount}, ` +
    `which was due on ${formattedDueDate}. Please arrange payment at your earliest convenience to settle this account. ` +
    `If you have already sent payment, please disregard this notice. Thank you.`
  );
}

/**
 * Creates and stores a new merchant invoice with positive integer minor units.
 */
export async function createInvoice(input: CreateInvoiceInput): Promise<IInvoiceDocument> {
  if (!input.amount || input.amount <= 0 || !Number.isInteger(input.amount)) {
    throw new Error('amount must be an integer stored strictly in minor units');
  }

  const userId = typeof input.userId === 'string' ? new Types.ObjectId(input.userId) : input.userId;
  const dueDate = typeof input.dueDate === 'string' ? new Date(input.dueDate) : input.dueDate;
  const currency = (input.currency || 'NGN').toUpperCase().trim();
  const invoiceNumber = input.invoiceNumber || generateInvoiceNumber();

  return await Invoice.create({
    userId,
    clientName: input.clientName,
    clientPhone: input.clientPhone,
    amount: input.amount,
    currency,
    description: input.description,
    dueDate,
    status: input.status || 'pending',
    reminderCount: 0,
    invoiceNumber,
  });
}

/**
 * Transitions an invoice's status from 'pending' to 'paid'.
 */
export async function markInvoiceAsPaid(
  invoiceId: Types.ObjectId | string
): Promise<IInvoiceDocument | null> {
  return await Invoice.findByIdAndUpdate(
    invoiceId,
    {
      $set: {
        status: 'paid',
        paidAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
}

/**
 * Updates an invoice status (e.g. 'pending', 'paid', 'overdue').
 */
export async function updateInvoiceStatus(
  invoiceId: Types.ObjectId | string,
  status: InvoiceStatus
): Promise<IInvoiceDocument | null> {
  const updateData: Record<string, unknown> = { status };
  if (status === 'paid') {
    updateData.paidAt = new Date();
  }
  return await Invoice.findByIdAndUpdate(
    invoiceId,
    { $set: updateData },
    { returnDocument: 'after' }
  );
}

/**
 * Records that a payment reminder was dispatched to the client.
 */
export async function recordInvoiceReminderSent(
  invoiceId: Types.ObjectId | string
): Promise<IInvoiceDocument | null> {
  return await Invoice.findByIdAndUpdate(
    invoiceId,
    {
      $inc: { reminderCount: 1 },
      $set: { lastReminderSentAt: new Date() },
    },
    { returnDocument: 'after' }
  );
}

/**
 * Retrieves all invoices for a given merchant user.
 */
export async function getInvoicesByUser(
  userId: Types.ObjectId | string,
  status?: InvoiceStatus
): Promise<IInvoiceDocument[]> {
  const uid = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
  const query: Record<string, unknown> = { userId: uid };
  if (status) {
    query.status = status;
  }
  return await Invoice.find(query).sort({ dueDate: 1, createdAt: -1 });
}

export {
  generateInvoicePdf,
  generateReceiptPdf,
  type GeneratePdfOptions,
  type InvoicePdfData,
};
