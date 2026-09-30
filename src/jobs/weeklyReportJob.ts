import cron, { ScheduledTask } from 'node-cron';
import { User, IUserDocument } from '../models/User';
import {
  createAndStoreWeeklyReport,
  sendWeeklyReportToWhatsApp,
} from '../services/analytics/reportService';

export interface WeeklyReportJobSummary {
  totalUsers: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ userId: string; whatsappId: string; error: string }>;
}

/**
 * Iterates through all users with weekly reports enabled, generates their
 * weekly visual financial report, and delivers the PNG image via WhatsApp.
 */
export async function runWeeklyReportsJob(
  referenceDate: Date = new Date()
): Promise<WeeklyReportJobSummary> {
  console.log('[WeeklyReportJob] Starting automated weekly report dispatch...');

  // Identify users with completed onboarding and weekly reports enabled
  const eligibleUsers: IUserDocument[] = await User.find({
    onboardingComplete: true,
    weeklyReportsEnabled: { $ne: false },
  });

  const summary: WeeklyReportJobSummary = {
    totalUsers: eligibleUsers.length,
    successCount: 0,
    errorCount: 0,
    errors: [],
  };

  for (const user of eligibleUsers) {
    try {
      // 1. Generate & Store weekly report (PNG + DB)
      const reportResult = await createAndStoreWeeklyReport(user, { referenceDate });

      // 2. Upload and send through WhatsApp
      await sendWeeklyReportToWhatsApp(user, reportResult);

      summary.successCount++;
      console.log(`[WeeklyReportJob] Successfully dispatched report to ${user.whatsappId}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      summary.errorCount++;
      summary.errors.push({
        userId: user._id.toString(),
        whatsappId: user.whatsappId,
        error: errorMsg,
      });
      console.error(
        `[WeeklyReportJob] Failed to dispatch report to user ${user.whatsappId}: ${errorMsg}`
      );
    }
  }

  console.log(
    `[WeeklyReportJob] Finished. Processed: ${summary.totalUsers}, Sent: ${summary.successCount}, Errors: ${summary.errorCount}`
  );

  return summary;
}

let activeSchedulerTask: ScheduledTask | null = null;

/**
 * Starts the weekly automated cron scheduler (defaults to every Monday at 08:00 AM Lagos time).
 */
export function startWeeklyReportScheduler(
  cronExpression = '0 8 * * 1',
  timezone = 'Africa/Lagos'
): ScheduledTask {
  if (activeSchedulerTask) {
    activeSchedulerTask.stop();
  }

  activeSchedulerTask = cron.schedule(
    cronExpression,
    async () => {
      try {
        await runWeeklyReportsJob();
      } catch (err) {
        console.error('[WeeklyReportScheduler] Unhandled job execution error:', err);
      }
    },
    {
      timezone,
    }
  );

  console.log(`[WeeklyReportScheduler] Scheduled with expression: "${cronExpression}" (${timezone})`);
  return activeSchedulerTask;
}

/**
 * Stops the active weekly automated cron scheduler.
 */
export function stopWeeklyReportScheduler(): void {
  if (activeSchedulerTask) {
    activeSchedulerTask.stop();
    activeSchedulerTask = null;
    console.log('[WeeklyReportScheduler] Scheduler stopped.');
  }
}
