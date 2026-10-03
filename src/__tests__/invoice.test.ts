import { Types } from 'mongoose';
import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User } from '../models/User';
import { Invoice } from '../models/Invoice';
import {
  createInvoice,
  markInvoiceAsPaid,
  updateInvoiceStatus,
  recordInvoiceReminderSent,
  generateDebtReminderMessage,
  generateInvoicePdf,
  generateReceiptPdf,
} from '../services/invoicing/invoiceService';

function extractAllTextFromPdf(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const hexPattern = /<([0-9a-fA-F]+)>/g;
  let decoded = '';
  let match;
  while ((match = hexPattern.exec(raw)) !== null) {
    try {
      decoded += Buffer.from(match[1], 'hex').toString('latin1');
    } catch {
      // ignore
    }
  }
  return raw + '\n' + decoded;
}

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterAll(async () => {
  await disconnectTestDb();
});

afterEach(async () => {
  await clearTestDb();
});

describe('WhatsApp Merchant Invoicing & Gentle Debt Collection (Issue #16)', () => {
  let merchantUserId: Types.ObjectId;

  beforeEach(async () => {
    const user = await User.create({
      whatsappId: '2348012345678',
      profileType: 'business',
      businessName: 'Adeleke Logistics & Trade',
      currency: 'NGN',
    });
    merchantUserId = user._id;
  });

  // ── 1. Invoice Model & Minor Units Validation ─────────────────────
  describe('Invoice Model & Minor Units Validation', () => {
    it('creates an invoice with valid positive integer minor units', async () => {
      // 5,000,000 minor units (kobo) = ₦50,000.00
      const dueDate = new Date('2026-10-20T12:00:00.000Z');
      const invoice = await createInvoice({
        userId: merchantUserId,
        clientName: 'Babajide Sanwo',
        clientPhone: '+2348022334455',
        amount: 5000000,
        currency: 'NGN',
        description: 'Warehousing & Haulage services',
        dueDate,
      });

      expect(invoice).toBeDefined();
      expect(invoice._id).toBeDefined();
      expect(invoice.clientName).toBe('Babajide Sanwo');
      expect(invoice.clientPhone).toBe('+2348022334455');
      expect(invoice.amount).toBe(5000000);
      expect(invoice.currency).toBe('NGN');
      expect(invoice.status).toBe('pending');
      expect(invoice.reminderCount).toBe(0);
      expect(invoice.invoiceNumber).toMatch(/^INV-\d{8}-[A-Z0-9]{4}$/);
      expect(new Date(invoice.dueDate).toISOString()).toBe(dueDate.toISOString());
    });

    it('rejects an invoice with zero or negative minor units', async () => {
      await expect(
        createInvoice({
          userId: merchantUserId,
          clientName: 'Client Negative',
          amount: -50000,
          dueDate: new Date('2026-10-25'),
        })
      ).rejects.toThrow(/minor units/i);

      await expect(
        createInvoice({
          userId: merchantUserId,
          clientName: 'Client Zero',
          amount: 0,
          dueDate: new Date('2026-10-25'),
        })
      ).rejects.toThrow(/minor units/i);
    });

    it('rejects an invoice with non-integer floating point minor units', async () => {
      await expect(
        createInvoice({
          userId: merchantUserId,
          clientName: 'Client Float',
          amount: 50000.75, // float kobo
          dueDate: new Date('2026-10-25'),
        })
      ).rejects.toThrow(/minor units/i);
    });

    it('enforces required fields (clientName, amount, dueDate, userId)', async () => {
      await expect(
        Invoice.create({
          userId: merchantUserId,
          amount: 100000,
          dueDate: new Date('2026-10-25'),
        } as unknown as Parameters<typeof Invoice.create>[0])
      ).rejects.toThrow(/clientName is required/);

      await expect(
        Invoice.create({
          clientName: 'Missing User',
          amount: 100000,
          dueDate: new Date('2026-10-25'),
        } as unknown as Parameters<typeof Invoice.create>[0])
      ).rejects.toThrow(/userId is required/);

      await expect(
        Invoice.create({
          userId: merchantUserId,
          clientName: 'Missing Due Date',
          amount: 100000,
        } as unknown as Parameters<typeof Invoice.create>[0])
      ).rejects.toThrow(/dueDate is required/);
    });

    it('defaults currency to NGN and status to pending', async () => {
      const invoice = await Invoice.create({
        userId: merchantUserId,
        clientName: 'Default Tester',
        amount: 250000,
        dueDate: new Date('2026-11-01'),
      });

      expect(invoice.currency).toBe('NGN');
      expect(invoice.status).toBe('pending');
      expect(invoice.reminderCount).toBe(0);
    });
  });

  // ── 2. Gentle Debt Collection Reminder Generator ─────────────────
  describe('Gentle Debt Collection Reminder Generator', () => {
    it('generates a polite check-in message for gentle stage with formatted currency', () => {
      const invoice = {
        userId: merchantUserId,
        clientName: 'Folake Solanke',
        amount: 7500000, // ₦75,000 in kobo
        currency: 'NGN',
        dueDate: new Date('2026-10-15T00:00:00.000Z'),
        status: 'pending' as const,
        reminderCount: 0,
        invoiceNumber: 'INV-20261015-X1Y2',
      };

      const message = generateDebtReminderMessage(invoice, 'gentle');

      // Check structure: "Hi [Name], friendly reminder regarding invoice #[ID] for [Amount] due on [Date]..."
      expect(message).toContain('Hi Folake Solanke');
      expect(message).toContain('friendly reminder regarding invoice #INV-20261015-X1Y2');
      expect(message).toContain('₦75,000');
      expect(message).toContain('15 Oct 2026');
      expect(message).toContain('Please let us know if you have any questions');
      expect(message).toContain('Thank you!');
    });

    it('generates a clear payment due notice for firm stage with professional, non-aggressive tone', () => {
      const invoice = {
        userId: merchantUserId,
        clientName: 'Emeka Okafor',
        amount: 15000000, // ₦150,000 in kobo
        currency: 'NGN',
        dueDate: new Date('2026-10-10T00:00:00.000Z'),
        status: 'pending' as const,
        reminderCount: 1,
        invoiceNumber: 'INV-20261010-99AA',
      };

      const message = generateDebtReminderMessage(invoice, 'firm');

      expect(message).toContain('Hi Emeka Okafor');
      expect(message).toContain('this is a payment due notice for invoice #INV-20261010-99AA');
      expect(message).toContain('₦150,000');
      expect(message).toContain('10 Oct 2026');
      expect(message).toContain('Please arrange payment at your earliest convenience to settle this account');
      expect(message).toContain('Thank you');
      // Verify non-aggressive tone (no hostile or threatening words)
      expect(message).not.toContain('court');
      expect(message).not.toContain('lawsuit');
      expect(message).not.toContain('penalty');
    });

    it('formats international currencies correctly (USD, EUR)', () => {
      const usdInvoice = {
        userId: merchantUserId,
        clientName: 'Alice Walker',
        amount: 25000, // $250.00 in cents
        currency: 'USD',
        dueDate: new Date('2026-10-18T00:00:00.000Z'),
        status: 'pending' as const,
        reminderCount: 0,
        invoiceNumber: 'INV-USD-101',
      };

      const usdMessage = generateDebtReminderMessage(usdInvoice, 'gentle');
      expect(usdMessage).toContain('$250');
      expect(usdMessage).toContain('invoice #INV-USD-101');

      const eurInvoice = {
        userId: merchantUserId,
        clientName: 'Jean Dupont',
        amount: 4500, // €45.00 in cents
        currency: 'EUR',
        dueDate: new Date('2026-10-22T00:00:00.000Z'),
        status: 'pending' as const,
        reminderCount: 0,
        invoiceNumber: 'INV-EUR-202',
      };

      const eurMessage = generateDebtReminderMessage(eurInvoice, 'firm');
      expect(eurMessage).toContain('€45');
      expect(eurMessage).toContain('invoice #INV-EUR-202');
    });
  });

  // ── 3. Status Transitions & Reminder Tracking ─────────────────────
  describe('Status Transitions & Reminder Tracking', () => {
    it('transitions an invoice status from pending to paid', async () => {
      const invoice = await createInvoice({
        userId: merchantUserId,
        clientName: 'Ken Saro',
        amount: 1200000,
        dueDate: new Date('2026-10-25'),
      });

      expect(invoice.status).toBe('pending');
      expect(invoice.paidAt).toBeUndefined();

      const updated = await markInvoiceAsPaid(invoice._id);
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('paid');
      expect(updated!.paidAt).toBeInstanceOf(Date);

      // Verify persistence in DB
      const found = await Invoice.findById(invoice._id);
      expect(found!.status).toBe('paid');
      expect(found!.paidAt).toBeDefined();
    });

    it('transitions an invoice status to overdue', async () => {
      const invoice = await createInvoice({
        userId: merchantUserId,
        clientName: 'Overdue Client',
        amount: 800000,
        dueDate: new Date('2026-10-01'),
      });

      const updated = await updateInvoiceStatus(invoice._id, 'overdue');
      expect(updated!.status).toBe('overdue');
    });

    it('tracks reminder count and updates lastReminderSentAt', async () => {
      const invoice = await createInvoice({
        userId: merchantUserId,
        clientName: 'Reminder Tracker',
        amount: 500000,
        dueDate: new Date('2026-10-20'),
      });

      expect(invoice.reminderCount).toBe(0);
      expect(invoice.lastReminderSentAt).toBeUndefined();

      const afterFirst = await recordInvoiceReminderSent(invoice._id);
      expect(afterFirst!.reminderCount).toBe(1);
      expect(afterFirst!.lastReminderSentAt).toBeInstanceOf(Date);

      const afterSecond = await recordInvoiceReminderSent(invoice._id);
      expect(afterSecond!.reminderCount).toBe(2);
    });
  });

  // ── 4. PDF Quotation/Invoice Vector Extension ─────────────────────
  describe('PDF Quotation/Invoice Vector Extension', () => {
    it('renders "INVOICE / QUOTATION" badge instead of "PAID" when isInvoice is true', async () => {
      const buffer = await generateReceiptPdf(
        {
          receiptNumber: 'INV-20261020-001',
          date: '20 Oct 2026',
          payer: 'Ngozi Okonjo',
          recipientName: 'Adeleke Logistics',
          isBusiness: true,
          businessName: 'Adeleke Logistics',
          amount: 250000,
          formattedAmount: '₦250,000',
          currency: 'NGN',
          description: 'Logistics and freight consulting',
        },
        { isInvoice: true, compress: false }
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');

      const text = extractAllTextFromPdf(buffer);
      expect(text).toContain('INVOICE / QUOTATION');
      expect(text).toContain('OFFICIAL INVOICE / QUOTATION');
      expect(text).toContain('INVOICE NUMBER');
      expect(text).toContain('BILL TO / CLIENT');
      expect(text).toContain('Ngozi Okonjo');
      expect(text).toContain('250,000');
      // Should NOT render PAID badge
      expect(text).not.toContain('STATUS: COMPLETED & VERIFIED');
    });

    it('renders "PENDING" badge when status is specified as PENDING', async () => {
      const buffer = await generateReceiptPdf(
        {
          receiptNumber: 'INV-20261020-002',
          date: '20 Oct 2026',
          payer: 'Chuka Umunna',
          recipientName: 'Adeleke Logistics',
          isBusiness: true,
          amount: 180000,
          formattedAmount: '₦180,000',
          currency: 'NGN',
          description: 'Supply chain audit',
          isInvoice: true,
        },
        { status: 'PENDING', compress: false }
      );

      const text = extractAllTextFromPdf(buffer);
      expect(text).toContain('PENDING');
      expect(text).toContain('STATUS: PENDING');
    });

    it('generates invoice PDF via generateInvoicePdf helper', async () => {
      const buffer = await generateInvoicePdf(
        {
          invoiceNumber: 'INV-20261030-XYZ',
          clientName: 'Zenith Global Holdings',
          amount: 45000000, // minor units: 450,000 NGN
          currency: 'NGN',
          description: 'Quarterly compliance & ERP system audit',
          dueDate: new Date('2026-10-30T00:00:00.000Z'),
          businessName: 'Adeleke Logistics & Trade',
          businessAddress: '10 Marina Boulevard, Lagos',
        },
        { compress: false }
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');

      const text = extractAllTextFromPdf(buffer);
      expect(text).toContain('INVOICE / QUOTATION');
      expect(text).toContain('Zenith Global Holdings');
      expect(text).toContain('Adeleke Logistics & Trade');
      expect(text).toContain('10 Marina Boulevard');
      expect(text).toContain('30 Oct 2026');
      expect(text).toContain('INV-20261030-XYZ');
    });

    it('respects privacy and omits client phone unless include_contact_phone is true', async () => {
      const testPhone = '+2348039988776';

      const bufferNoPhone = await generateInvoicePdf(
        {
          invoiceNumber: 'INV-PRIVACY-01',
          clientName: 'Secret Client',
          clientPhone: testPhone,
          amount: 1000000,
          currency: 'NGN',
          description: 'Private Consultation',
          include_contact_phone: false,
        },
        { compress: false }
      );

      const textNoPhone = extractAllTextFromPdf(bufferNoPhone);
      expect(textNoPhone).not.toContain(testPhone);

      const bufferWithPhone = await generateInvoicePdf(
        {
          invoiceNumber: 'INV-PRIVACY-02',
          clientName: 'Secret Client',
          clientPhone: testPhone,
          amount: 1000000,
          currency: 'NGN',
          description: 'Private Consultation',
          include_contact_phone: true,
        },
        { compress: false }
      );

      const textWithPhone = extractAllTextFromPdf(bufferWithPhone);
      expect(textWithPhone).toContain(testPhone);
    });
  });
});
