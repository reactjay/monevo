import sharp from 'sharp';
import { Types } from 'mongoose';
import { IUserDocument } from '../../models/User';
import { WeeklyReport, IWeeklyReportDocument } from '../../models/WeeklyReport';
import { Transaction } from '../../models/Transaction';
import { ITopCategory } from '../../types/models';
import { generateWeeklyReportSvg, WeeklyReportTemplateData } from './reportTemplate';
import { formatCurrency } from '../tools/formatters';
import { uploadMedia, sendImageMessage } from '../whatsapp/client';

export interface WeekDateRange {
  weekStart: Date;
  weekEnd: Date;
  periodLabel: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Calculates Monday 00:00:00.000 to Sunday 23:59:59.999 for the given reference date.
 */
export function getWeekDateRange(referenceDate: Date = new Date()): WeekDateRange {
  const ref = new Date(referenceDate);
  const dayOfWeek = ref.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Distance to Monday: if Sun (0), go back 6 days; otherwise go back (dayOfWeek - 1) days
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const weekStart = new Date(ref);
  weekStart.setDate(ref.getDate() + diffToMonday);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const startDay = weekStart.getDate();
  const startMonth = MONTHS[weekStart.getMonth()];
  const endDay = weekEnd.getDate();
  const endMonth = MONTHS[weekEnd.getMonth()];
  const endYear = weekEnd.getFullYear();

  const periodLabel = `${startDay} ${startMonth} → ${endDay} ${endMonth} ${endYear}`;

  return { weekStart, weekEnd, periodLabel };
}

export interface WeeklyAggregatedData {
  totalIncome: number;
  totalExpenses: number;
  net: number;
  transactionCount: number;
  topCategories: ITopCategory[];
}

/**
 * Executes a MongoDB aggregation pipeline to compute financial statistics for a week.
 */
export async function getWeeklyAggregatedData(
  userId: Types.ObjectId,
  weekStart: Date,
  weekEnd: Date
): Promise<WeeklyAggregatedData> {
  const pipeline = [
    {
      $match: {
        userId,
        date: { $gte: weekStart, $lte: weekEnd },
      },
    },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalIncome: {
                $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] },
              },
              totalExpenses: {
                $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] },
              },
              count: { $sum: 1 },
            },
          },
        ],
        categories: [
          { $match: { type: 'expense' } },
          {
            $group: {
              _id: '$category',
              amount: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
          { $sort: { amount: -1 as const } },
          { $limit: 6 },
        ],
      },
    },
  ];

  const results = await Transaction.aggregate(pipeline);
  const facetResult = results[0] || { totals: [], categories: [] };

  const totals = facetResult.totals[0] || { totalIncome: 0, totalExpenses: 0, count: 0 };
  const totalIncome = totals.totalIncome || 0;
  const totalExpenses = totals.totalExpenses || 0;
  const net = totalIncome - totalExpenses;
  const transactionCount = totals.count || 0;

  const topCategories: ITopCategory[] = (facetResult.categories || []).map(
    (c: { _id: string; amount: number; count: number }) => ({
      category: c._id || 'other',
      amount: c.amount || 0,
      count: c.count || 0,
    })
  );

  return {
    totalIncome,
    totalExpenses,
    net,
    transactionCount,
    topCategories,
  };
}

export interface GeneratedWeeklyReportResult {
  report: IWeeklyReportDocument;
  pngBuffer: Buffer;
  svg: string;
  weekStart: Date;
  weekEnd: Date;
  periodLabel: string;
  data: WeeklyAggregatedData;
}

/**
 * Deterministically renders an SVG string to a PNG Buffer using Sharp.
 */
export async function renderReportPng(svgString: string): Promise<Buffer> {
  return sharp(Buffer.from(svgString))
    .png({ quality: 95, compressionLevel: 9 })
    .toBuffer();
}

/**
 * Generates and stores a Weekly Report in MongoDB with rendered PNG buffer.
 */
export async function createAndStoreWeeklyReport(
  user: IUserDocument,
  options: { referenceDate?: Date; weekStart?: Date; weekEnd?: Date } = {}
): Promise<GeneratedWeeklyReportResult> {
  let weekStart: Date;
  let weekEnd: Date;
  let periodLabel: string;

  if (options.weekStart && options.weekEnd) {
    weekStart = options.weekStart;
    weekEnd = options.weekEnd;
    const startDay = weekStart.getDate();
    const startMonth = MONTHS[weekStart.getMonth()];
    const endDay = weekEnd.getDate();
    const endMonth = MONTHS[weekEnd.getMonth()];
    const endYear = weekEnd.getFullYear();
    periodLabel = `${startDay} ${startMonth} → ${endDay} ${endMonth} ${endYear}`;
  } else {
    const range = getWeekDateRange(options.referenceDate || new Date());
    weekStart = range.weekStart;
    weekEnd = range.weekEnd;
    periodLabel = range.periodLabel;
  }

  // 1. Fetch Aggregated Statistics
  const data = await getWeeklyAggregatedData(user._id, weekStart, weekEnd);

  // 2. Prepare Template Data
  const currency = user.currency || 'NGN';
  const isBusiness = user.profileType === 'business';
  const recipientName = isBusiness
    ? user.businessName || user.name || 'Merchant'
    : user.name || 'Account Holder';

  const now = new Date();
  const generatedAtStr = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const templateData: WeeklyReportTemplateData = {
    recipientName,
    isBusiness,
    businessName: user.businessName,
    currency,
    periodLabel,
    totalIncome: data.totalIncome,
    formattedIncome: formatCurrency(data.totalIncome, currency),
    totalExpenses: data.totalExpenses,
    formattedExpenses: formatCurrency(data.totalExpenses, currency),
    net: data.net,
    formattedNet: formatCurrency(Math.abs(data.net), currency),
    transactionCount: data.transactionCount,
    topCategories: data.topCategories,
    generatedAtStr,
  };

  // 3. Generate SVG and PNG Buffer
  const svg = generateWeeklyReportSvg(templateData);
  const pngBuffer = await renderReportPng(svg);

  // 4. Save/Update record in MongoDB (upsert unique by userId + weekStart)
  const report = await WeeklyReport.findOneAndUpdate(
    { userId: user._id, weekStart },
    {
      userId: user._id,
      weekStart,
      weekEnd,
      totalIncome: data.totalIncome,
      totalExpenses: data.totalExpenses,
      net: data.net,
      transactionCount: data.transactionCount,
      topCategories: data.topCategories,
      generatedAt: now,
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );

  return {
    report,
    pngBuffer,
    svg,
    weekStart,
    weekEnd,
    periodLabel,
    data,
  };
}

/**
 * Sends a generated weekly report image to the user's WhatsApp.
 */
export async function sendWeeklyReportToWhatsApp(
  user: IUserDocument,
  reportResult: GeneratedWeeklyReportResult
): Promise<string> {
  const { periodLabel, pngBuffer, report, data } = reportResult;
  const currency = user.currency || 'NGN';
  const filename = `Weekly_Report_${report.weekStart.toISOString().slice(0, 10)}.png`;

  // 1. Upload media to Meta WhatsApp API
  const mediaId = await uploadMedia(pngBuffer, 'image/png', filename);

  // 2. Persist mediaReference on MongoDB report record
  report.imageReference = mediaId;
  await report.save();

  // 3. Caption with quick highlight
  const caption = `📊 *Weekly Financial Report (${periodLabel})*

• Income: ${formatCurrency(data.totalIncome, currency)}
• Expenses: ${formatCurrency(data.totalExpenses, currency)}
• Net: ${formatCurrency(data.net, currency)}
• Transactions: ${data.transactionCount}

Detailed visual breakdown is shown above! 📈`;

  // 4. Send Image Message to user
  await sendImageMessage(user.whatsappId, mediaId, caption);

  return mediaId;
}
