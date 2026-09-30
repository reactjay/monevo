import { IUserDocument } from '../../models/User';
import {
  createAndStoreWeeklyReport,
  sendWeeklyReportToWhatsApp,
  GeneratedWeeklyReportResult,
} from '../analytics/reportService';
import { formatCurrency } from './formatters';

export interface GenerateReportToolParams {
  user: IUserDocument;
  period?: 'this_week' | 'last_week' | string;
  source?: 'text' | 'voice';
}

export interface GenerateReportToolResult {
  success: boolean;
  message: string;
  reportResult?: GeneratedWeeklyReportResult;
}

/**
 * Generates, stores, and sends the user's weekly visual analytics report.
 */
export async function generateReportTool(
  params: GenerateReportToolParams
): Promise<GenerateReportToolResult> {
  const { user, period = 'this_week' } = params;
  const userCurrency = user.currency || 'NGN';

  let referenceDate = new Date();
  if (period === 'last_week') {
    referenceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  try {
    const reportResult = await createAndStoreWeeklyReport(user, { referenceDate });

    // Send Image via WhatsApp
    try {
      await sendWeeklyReportToWhatsApp(user, reportResult);
    } catch (err) {
      console.error('Failed to deliver weekly report image via WhatsApp API:', err);
    }

    const netSign = reportResult.data.net > 0 ? '+' : '';
    const formattedNet = `${netSign}${formatCurrency(reportResult.data.net, userCurrency)}`;

    const message = `📊 *Weekly Financial Report Generated!*

*Period:* ${reportResult.periodLabel}
• *Total Income:* +${formatCurrency(reportResult.data.totalIncome, userCurrency)}
• *Total Expenses:* -${formatCurrency(reportResult.data.totalExpenses, userCurrency)}
• *Net Savings:* ${formattedNet}
• *Transactions Recorded:* ${reportResult.data.transactionCount}

Your visual analytics report has been sent above! 📈`;

    return {
      success: true,
      message,
      reportResult,
    };
  } catch (err) {
    console.error('Error generating weekly report:', err);
    return {
      success: false,
      message: 'Sorry, I encountered an error generating your weekly report. Please try again in a moment.',
    };
  }
}
