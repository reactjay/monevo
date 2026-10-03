import axios from 'axios';
import { connectTestDb, disconnectTestDb, clearTestDb } from './helpers/testDb';
import { User, IUserDocument } from '../models/User';
import { Receipt } from '../models/Receipt';
import { Transaction } from '../models/Transaction';
import {
  generateReceiptNumber,
  renderReceiptPng,
  formatReceiptDate,
  createAndStoreReceipt,
  sendReceiptToWhatsApp,
} from '../services/receipts/receiptService';
import {
  generateReceiptSvg,
  wrapText,
  escapeXml,
  ReceiptTemplateData,
} from '../services/receipts/receiptTemplate';
import { generateReceiptTool } from '../services/tools/generateReceiptTool';
import { extractIntent } from '../services/ai/intentExtractor';
import { dispatchIntent } from '../services/tools/toolDispatcher';
import * as whatsappClient from '../services/whatsapp/client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

let personalUser: IUserDocument;
let businessUser: IUserDocument;

beforeAll(async () => {
  await connectTestDb();
}, 60000);

afterAll(async () => {
  await disconnectTestDb();
});

beforeEach(async () => {
  await clearTestDb();
  jest.clearAllMocks();

  // Create personal test user
  personalUser = await User.create({
    whatsappId: '2348011223344',
    name: 'Ada Lovelace',
    phone: '+234 801 122 3344',
    profileType: 'personal',
    currency: 'NGN',
    onboardingComplete: true,
  });

  // Create business test user
  businessUser = await User.create({
    whatsappId: '2348099887766',
    name: 'Chidi Anagonye',
    businessName: 'Anagonye Tech Labs Ltd',
    phone: '+234 809 988 7766',
    businessAddress: '14 Admiralty Way, Lekki Phase 1, Lagos',
    profileType: 'business',
    currency: 'NGN',
    onboardingComplete: true,
  });
});

describe('Phase 11: Professional Receipt Generation', () => {
  // ── 1. Receipt Numbering ──────────────────────────────────────────
  describe('Receipt Numbering', () => {
    it('generates standardized receipt number in REC-YYYYMMDD-XXXX format', () => {
      const testDate = new Date('2026-09-11T10:00:00Z');
      const num = generateReceiptNumber(testDate);
      expect(num).toMatch(/^REC-20260911-[A-F0-9]{4}$/);
    });

    it('generates unique receipt numbers across repeated calls', () => {
      const numbers = new Set<string>();
      for (let i = 0; i < 50; i++) {
        numbers.add(generateReceiptNumber());
      }
      expect(numbers.size).toBe(50);
    });

    it('formats receipt date correctly', () => {
      const testDate = new Date('2026-09-11T12:00:00Z');
      const formatted = formatReceiptDate(testDate);
      expect(formatted).toContain('11 Sep 2026');
    });
  });

  // ── 2. SVG Template & Text Wrapping ───────────────────────────────
  describe('SVG Template Generator', () => {
    it('escapes XML entities safely', () => {
      expect(escapeXml('Tom & Jerry <Tech> "Solutions" \'Ltd\'')).toBe(
        'Tom &amp; Jerry &lt;Tech&gt; &quot;Solutions&quot; &#39;Ltd&#39;'
      );
    });

    it('wraps long descriptions into multiple lines', () => {
      const longText =
        'Comprehensive full stack web application development including authentication payment gateway and admin dashboard';
      const lines = wrapText(longText, 35);
      expect(lines.length).toBeGreaterThan(1);
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(40);
      }
    });

    it('generates professional SVG for a personal user (excludes phone by default)', () => {
      const data: ReceiptTemplateData = {
        receiptNumber: 'REC-20260911-TEST',
        date: '11 Sep 2026',
        payer: 'David Adeleke',
        recipientName: 'Ada Lovelace',
        isBusiness: false,
        userPhone: '+234 801 122 3344',
        amount: 150000,
        formattedAmount: '₦150,000',
        currency: 'NGN',
        description: 'Website development',
        status: 'PAID',
      };

      const svg = generateReceiptSvg(data);
      expect(svg).toContain('<svg');
      expect(svg).toContain('REC-20260911-TEST');
      expect(svg).toContain('Ada Lovelace');
      expect(svg).toContain('David Adeleke');
      expect(svg).toContain('₦150,000');
      expect(svg).toContain('Website development');
      expect(svg).toContain('PAID');
      expect(svg).not.toContain('+234 801 122 3344');
      expect(svg).not.toContain('CONTACT');
      expect(svg).toContain('</svg>');
    });

    it('generates professional SVG for a business user including business name and address (excludes phone by default)', () => {
      const data: ReceiptTemplateData = {
        receiptNumber: 'REC-20260911-BIZ1',
        date: '11 Sep 2026',
        payer: 'Globex Corp',
        recipientName: 'Chidi Anagonye',
        isBusiness: true,
        businessName: 'Anagonye Tech Labs Ltd',
        businessPhone: '+234 809 988 7766',
        businessAddress: '14 Admiralty Way, Lekki Phase 1, Lagos',
        amount: 500000,
        formattedAmount: '₦500,000',
        currency: 'NGN',
        description: 'Enterprise ERP Consultation and Cloud Setup',
        status: 'PAID',
      };

      const svg = generateReceiptSvg(data);
      expect(svg).toContain('Anagonye Tech Labs Ltd');
      expect(svg).toContain('14 Admiralty Way, Lekki Phase 1, Lagos');
      expect(svg).not.toContain('+234 809 988 7766');
      expect(svg).not.toContain('CONTACT');
      expect(svg).toContain('Globex Corp');
      expect(svg).toContain('₦500,000');
      expect(svg).toContain('PAID');
    });

    it('includes contact phone when include_contact_phone is explicitly true', () => {
      const data: ReceiptTemplateData = {
        receiptNumber: 'REC-20260911-PHONE',
        date: '11 Sep 2026',
        payer: 'David Adeleke',
        recipientName: 'Ada Lovelace',
        isBusiness: false,
        userPhone: '+234 801 122 3344',
        include_contact_phone: true,
        amount: 150000,
        formattedAmount: '₦150,000',
        currency: 'NGN',
        description: 'Website development',
        status: 'PAID',
      };

      const svg = generateReceiptSvg(data);
      expect(svg).toContain('CONTACT');
      expect(svg).toContain('+234 801 122 3344');
    });

    it('handles long description gracefully with multi-line tspans in SVG', () => {
      const longDesc =
        'Full software development services for cross-platform mobile app including backend APIs, user authentication, and push notifications';
      const data: ReceiptTemplateData = {
        receiptNumber: 'REC-20260911-LONG',
        date: '11 Sep 2026',
        payer: 'Super Client',
        recipientName: 'Ada Lovelace',
        isBusiness: false,
        amount: 750000,
        formattedAmount: '₦750,000',
        currency: 'NGN',
        description: longDesc,
      };

      const svg = generateReceiptSvg(data);
      expect(svg).toContain('<tspan');
      expect(svg).toContain('cross-platform');
    });
  });

  // ── 3. PNG Image Generation with Sharp ────────────────────────────
  describe('PNG Image Rendering with Sharp', () => {
    it('converts SVG receipt string to valid PNG buffer', async () => {
      const data: ReceiptTemplateData = {
        receiptNumber: 'REC-20260911-SHARP',
        date: '11 Sep 2026',
        payer: 'David Adeleke',
        recipientName: 'Ada Lovelace',
        isBusiness: false,
        amount: 150000,
        formattedAmount: '₦150,000',
        currency: 'NGN',
        description: 'Website development',
      };

      const svg = generateReceiptSvg(data);
      const pngBuffer = await renderReceiptPng(svg);

      expect(Buffer.isBuffer(pngBuffer)).toBe(true);
      expect(pngBuffer.length).toBeGreaterThan(1000);

      // Verify PNG magic header bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(pngBuffer.subarray(0, 8)).toEqual(pngSignature);
    });
  });

  // ── 4. Receipt Storage & MongoDB Metadata ─────────────────────────
  describe('Receipt Storage & MongoDB Persistence', () => {
    it('creates personal receipt, stores metadata in MongoDB, and generates PNG', async () => {
      const result = await createAndStoreReceipt({
        user: personalUser,
        payer: 'David',
        amount: 150000,
        currency: 'NGN',
        description: 'Website development',
      });

      expect(result.receiptNumber).toMatch(/^REC-/);
      expect(result.pngBuffer.length).toBeGreaterThan(0);

      // Verify MongoDB persistence
      const savedReceipt = await Receipt.findOne({ receiptNumber: result.receiptNumber });
      expect(savedReceipt).not.toBeNull();
      expect(savedReceipt!.userId.toString()).toBe(personalUser._id.toString());
      expect(savedReceipt!.payer).toBe('David');
      expect(savedReceipt!.recipient).toBe('Ada Lovelace');
      expect(savedReceipt!.amount).toBe(150000);
      expect(savedReceipt!.currency).toBe('NGN');
      expect(savedReceipt!.description).toBe('Website development');

      // Verify linked transaction in MongoDB
      const linkedTx = await Transaction.findById(savedReceipt!.transactionId);
      expect(linkedTx).not.toBeNull();
      expect(linkedTx!.type).toBe('income');
      expect(linkedTx!.amount).toBe(150000);
    });

    it('creates business receipt with business recipient in MongoDB', async () => {
      const result = await createAndStoreReceipt({
        user: businessUser,
        payer: 'Acme Corp',
        amount: 300000,
        currency: 'NGN',
        description: 'Server Migration',
      });

      const savedReceipt = await Receipt.findOne({ receiptNumber: result.receiptNumber });
      expect(savedReceipt).not.toBeNull();
      expect(savedReceipt!.recipient).toBe('Anagonye Tech Labs Ltd');
      expect(savedReceipt!.amount).toBe(300000);
      expect(savedReceipt!.payer).toBe('Acme Corp');
    });

    it('links to existing income transaction if one matches', async () => {
      const existingTx = await Transaction.create({
        userId: personalUser._id,
        type: 'income',
        amount: 75000,
        currency: 'NGN',
        category: 'freelance',
        description: 'Logo Design',
        counterparty: 'Sarah',
        date: new Date(),
        source: 'text',
      });

      const result = await createAndStoreReceipt({
        user: personalUser,
        payer: 'Sarah',
        amount: 75000,
        currency: 'NGN',
        description: 'Logo Design',
      });

      expect(result.receipt.transactionId.toString()).toBe(existingTx._id.toString());
    });

    it('throws error when amount is zero or negative', async () => {
      await expect(
        createAndStoreReceipt({
          user: personalUser,
          payer: 'David',
          amount: 0,
        })
      ).rejects.toThrow('Receipt amount must be greater than zero');
    });

    it('throws error when payer is empty', async () => {
      await expect(
        createAndStoreReceipt({
          user: personalUser,
          payer: '',
          amount: 50000,
        })
      ).rejects.toThrow('Receipt payer name is required');
    });
  });

  // ── 5. Missing Fields Validation ──────────────────────────────────
  describe('Missing Fields Handling in generateReceiptTool', () => {
    it('handles missing amount with prompt for specific counterparty', async () => {
      const result = await generateReceiptTool({
        user: personalUser,
        intent: {
          intent: 'generate_receipt',
          target: {
            counterparty: 'David',
            amount: undefined,
            description: 'website development',
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('How much was the receipt for *David*?');
    });

    it('handles missing amount when no counterparty is given', async () => {
      const result = await generateReceiptTool({
        user: personalUser,
        intent: {
          intent: 'generate_receipt',
          target: {
            counterparty: null,
            amount: undefined,
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('How much was this payment for?');
    });

    it('handles missing payer when amount is provided', async () => {
      const result = await generateReceiptTool({
        user: personalUser,
        intent: {
          intent: 'generate_receipt',
          target: {
            counterparty: null,
            amount: 150000,
            description: 'consulting',
          },
        },
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Who did you receive the payment of *₦150,000* from?');
    });
  });

  // ── 6. Intent Extraction for Receipts ─────────────────────────────
  describe('AI Receipt Intent Extraction', () => {
    it('extracts complete receipt details from example user prompt', async () => {
      const prompt = 'Create a receipt for ₦150,000 received from David for website development.';
      const intent = await extractIntent(prompt, { defaultCurrency: 'NGN' });

      expect(intent.intent).toBe('generate_receipt');
      if (intent.intent === 'generate_receipt') {
        expect(intent.target.counterparty).toBe('David');
        expect(intent.target.amount).toBe(150000);
        expect(intent.target.description).toBe('Website development');
      }
    });

    it('extracts receipt info when expressed as "Receipt for <Name>" with amount', async () => {
      const prompt = 'Receipt for David for website development 150k';
      const intent = await extractIntent(prompt, { defaultCurrency: 'NGN' });

      expect(intent.intent).toBe('generate_receipt');
      if (intent.intent === 'generate_receipt') {
        expect(intent.target.counterparty).toBe('David');
        expect(intent.target.amount).toBe(150000);
      }
    });

    it('extracts receipt request with missing amount', async () => {
      const prompt = 'Generate a receipt for David';
      const intent = await extractIntent(prompt, { defaultCurrency: 'NGN' });

      expect(intent.intent).toBe('generate_receipt');
      if (intent.intent === 'generate_receipt') {
        expect(intent.target.counterparty).toBe('David');
        expect(intent.target.amount).toBeUndefined();
      }
    });
  });

  // ── 7. Tool Dispatcher & WhatsApp Integration ─────────────────────
  describe('Tool Dispatcher & WhatsApp Delivery', () => {
    it('dispatches generate_receipt intent, generates receipt and formats confirmation', async () => {
      // Mock WhatsApp API calls
      const uploadMediaSpy = jest
        .spyOn(whatsappClient, 'uploadMedia')
        .mockResolvedValue('mock_media_id_12345');
      const sendImageSpy = jest
        .spyOn(whatsappClient, 'sendImageMessage')
        .mockResolvedValue(undefined);

      const intent = await extractIntent(
        'Create a receipt for ₦150,000 received from David for website development.'
      );

      const response = await dispatchIntent(intent, {
        user: personalUser,
        source: 'text',
        whatsappMessageId: 'wamid.receipt001',
      });

      expect(response).toContain('Receipt Generated Successfully!');
      expect(response).toContain('David');
      expect(response).toContain('₦150,000');
      expect(response).toContain('Website development');
      expect(response).toContain('PAID ✅');

      // Verify upload and send were called
      expect(uploadMediaSpy).toHaveBeenCalledTimes(1);
      expect(sendImageSpy).toHaveBeenCalledWith(
        personalUser.whatsappId,
        'mock_media_id_12345',
        expect.stringContaining('REC-')
      );

      uploadMediaSpy.mockRestore();
      sendImageSpy.mockRestore();
    });

    it('sends receipt directly via sendReceiptToWhatsApp', async () => {
      // Mock Meta API post for uploadMedia and sendImageMessage
      mockedAxios.post.mockImplementation((url) => {
        if (typeof url === 'string' && url.includes('/media')) {
          return Promise.resolve({ data: { id: 'media_id_abc999' } });
        }
        return Promise.resolve({ data: { messages: [{ id: 'wamid.msg999' }] } });
      });

      const receiptResult = await createAndStoreReceipt({
        user: businessUser,
        payer: 'Zenith Bank',
        amount: 250000,
        currency: 'NGN',
        description: 'API Integration Consulting',
      });

      const mediaId = await sendReceiptToWhatsApp(businessUser, receiptResult);
      expect(mediaId).toBe('media_id_abc999');

      const updated = await Receipt.findById(receiptResult.receipt._id);
      expect(updated?.mediaReference).toBe('media_id_abc999');
    });
  });

  // ── 8. Receipt PII Protection & Sender Contact Info (Issue #22) ──
  describe('Receipt PII Protection & Sender Contact Info (Issue #22)', () => {
    it('excludes sender phone number by default when generating receipt', async () => {
      const result = await createAndStoreReceipt({
        user: personalUser,
        payer: 'David',
        amount: 50000,
        currency: 'NGN',
        description: 'Consultation',
      });

      expect(result.svg).not.toContain(personalUser.phone);
      expect(result.svg).not.toContain(personalUser.whatsappId);
      expect(result.svg).not.toContain('CONTACT');
    });

    it('populates contact number when include_contact_phone = true is explicitly requested', async () => {
      const result = await createAndStoreReceipt({
        user: personalUser,
        payer: 'David',
        amount: 50000,
        currency: 'NGN',
        description: 'Consultation',
        include_contact_phone: true,
      });

      expect(result.svg).toContain('CONTACT');
      expect(result.svg).toContain(personalUser.phone!);
    });

    it('uses user profile preference include_phone_on_receipts if not overridden', async () => {
      const privacyUser = await User.create({
        whatsappId: '2348199990001',
        profileType: 'personal',
        name: 'Privacy Minded',
        phone: '+234 819 999 0001',
        currency: 'NGN',
        include_phone_on_receipts: true,
      });

      const resultWithPhone = await createAndStoreReceipt({
        user: privacyUser,
        payer: 'David',
        amount: 50000,
      });
      expect(resultWithPhone.svg).toContain('+234 819 999 0001');

      // Explicit override: include_contact_phone = false overrides profile setting
      const resultOverridden = await createAndStoreReceipt({
        user: privacyUser,
        payer: 'David',
        amount: 50000,
        include_contact_phone: false,
      });
      expect(resultOverridden.svg).not.toContain('+234 819 999 0001');
      expect(resultOverridden.svg).not.toContain('CONTACT');
    });

    it('generateReceiptTool includes privacy disclosure tip when phone is excluded by default', async () => {
      jest.spyOn(whatsappClient, 'uploadMedia').mockResolvedValue('mock_id');
      jest.spyOn(whatsappClient, 'sendImageMessage').mockResolvedValue(undefined);

      const res = await generateReceiptTool({
        user: personalUser,
        intent: {
          intent: 'generate_receipt',
          target: {
            payer_name: 'David',
            amount: 50000,
            description: 'Consultation',
          },
        },
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain("💡 Tip: Your phone number was excluded from this receipt for privacy. To include it next time, say 'include my phone number'.");
    });

    it('generateReceiptTool informs user when phone was included upon explicit request', async () => {
      jest.spyOn(whatsappClient, 'uploadMedia').mockResolvedValue('mock_id');
      jest.spyOn(whatsappClient, 'sendImageMessage').mockResolvedValue(undefined);

      const res = await generateReceiptTool({
        user: personalUser,
        intent: {
          intent: 'generate_receipt',
          target: {
            payer_name: 'David',
            amount: 50000,
            description: 'Consultation',
            include_contact_phone: true,
          },
        },
      });

      expect(res.success).toBe(true);
      expect(res.message).toContain("💡 Tip: Your phone number was included on this receipt. To exclude it next time, say 'exclude my phone number'.");
      expect(res.receiptResult?.svg).toContain(personalUser.phone!);
    });

    it('extracts include_contact_phone override from natural language prompt', async () => {
      const intentWithPhone = await extractIntent(
        'Receipt for David 150k for web design, include my phone number',
        { defaultCurrency: 'NGN' }
      );

      expect(intentWithPhone.intent).toBe('generate_receipt');
      if (intentWithPhone.intent === 'generate_receipt') {
        expect(intentWithPhone.target.counterparty).toBe('David');
        expect(intentWithPhone.target.amount).toBe(150000);
        expect(intentWithPhone.target.include_contact_phone).toBe(true);
        expect(intentWithPhone.target.description).not.toContain('phone number');
      }

      const intentWithoutPhone = await extractIntent(
        'Receipt for David 150k for web design, do not include my phone number',
        { defaultCurrency: 'NGN' }
      );

      expect(intentWithoutPhone.intent).toBe('generate_receipt');
      if (intentWithoutPhone.intent === 'generate_receipt') {
        expect(intentWithoutPhone.target.include_contact_phone).toBe(false);
      }
    });

    it('toggles user profile include_phone_on_receipts preference via text command', async () => {
      const user = await User.create({
        whatsappId: '2348123456789',
        profileType: 'personal',
        name: 'Test Toggler',
        phone: '+234 812 345 6789',
        currency: 'NGN',
        include_phone_on_receipts: false,
      });

      const intentEnable = await extractIntent('include my phone number');
      expect(intentEnable.intent).toBe('profile_update');
      if (intentEnable.intent === 'profile_update') {
        expect(intentEnable.fields.include_phone_on_receipts).toBe(true);
      }

      const replyEnable = await dispatchIntent(intentEnable, { user, source: 'text' });
      expect(replyEnable).toContain('Phone number will now be included on future receipts.');
      const updatedUser = await User.findById(user._id);
      expect(updatedUser?.include_phone_on_receipts).toBe(true);

      const intentDisable = await extractIntent('exclude my phone number');
      expect(intentDisable.intent).toBe('profile_update');
      if (intentDisable.intent === 'profile_update') {
        expect(intentDisable.fields.include_phone_on_receipts).toBe(false);
      }

      const replyDisable = await dispatchIntent(intentDisable, { user, source: 'text' });
      expect(replyDisable).toContain('Phone number will now be excluded from future receipts for privacy.');
      const finalUser = await User.findById(user._id);
      expect(finalUser?.include_phone_on_receipts).toBe(false);
    });
  });
});
