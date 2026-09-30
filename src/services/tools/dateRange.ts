import { QueryPeriod } from '../ai/schemas';
import { formatDateToYYYYMMDD } from '../ai/dateParser';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Calculates start and end Date objects for a given period in the specified timezone (default: Africa/Lagos).
 */
export function calculateDateRange(
  period: QueryPeriod | string = 'this_month',
  referenceDate: Date = new Date(),
  timezone = 'Africa/Lagos'
): DateRange {
  const refDateStr = formatDateToYYYYMMDD(referenceDate, timezone);
  const [yearStr, monthStr, dayStr] = refDateStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed
  const day = parseInt(dayStr, 10);

  // Helper to create UTC bounds representing local day in UTC
  const startOfDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const endOfDay = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 23, 59, 59, 999));

  switch (period) {
    case 'today': {
      return {
        startDate: startOfDay(year, month, day),
        endDate: endOfDay(year, month, day),
      };
    }

    case 'yesterday': {
      const targetDate = new Date(Date.UTC(year, month, day - 1));
      return {
        startDate: startOfDay(
          targetDate.getUTCFullYear(),
          targetDate.getUTCMonth(),
          targetDate.getUTCDate()
        ),
        endDate: endOfDay(
          targetDate.getUTCFullYear(),
          targetDate.getUTCMonth(),
          targetDate.getUTCDate()
        ),
      };
    }

    case 'this_week': {
      // Find Monday of current week
      const current = new Date(Date.UTC(year, month, day));
      const dayOfWeek = current.getUTCDay(); // 0 is Sunday, 1 is Monday...
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(Date.UTC(year, month, day + diffToMonday));
      const sunday = new Date(
        Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6)
      );

      return {
        startDate: startOfDay(
          monday.getUTCFullYear(),
          monday.getUTCMonth(),
          monday.getUTCDate()
        ),
        endDate: endOfDay(
          sunday.getUTCFullYear(),
          sunday.getUTCMonth(),
          sunday.getUTCDate()
        ),
      };
    }

    case 'last_week': {
      const current = new Date(Date.UTC(year, month, day));
      const dayOfWeek = current.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const lastMonday = new Date(Date.UTC(year, month, day + diffToMonday - 7));
      const lastSunday = new Date(
        Date.UTC(lastMonday.getUTCFullYear(), lastMonday.getUTCMonth(), lastMonday.getUTCDate() + 6)
      );

      return {
        startDate: startOfDay(
          lastMonday.getUTCFullYear(),
          lastMonday.getUTCMonth(),
          lastMonday.getUTCDate()
        ),
        endDate: endOfDay(
          lastSunday.getUTCFullYear(),
          lastSunday.getUTCMonth(),
          lastSunday.getUTCDate()
        ),
      };
    }

    case 'this_month': {
      const firstDay = startOfDay(year, month, 1);
      // Last day of current month: Day 0 of next month
      const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const lastDay = endOfDay(year, month, lastDayOfMonth);
      return { startDate: firstDay, endDate: lastDay };
    }

    case 'last_month': {
      const prevMonthYear = month === 0 ? year - 1 : year;
      const prevMonth = month === 0 ? 11 : month - 1;
      const firstDay = startOfDay(prevMonthYear, prevMonth, 1);
      const lastDayOfMonth = new Date(Date.UTC(prevMonthYear, prevMonth + 1, 0)).getUTCDate();
      const lastDay = endOfDay(prevMonthYear, prevMonth, lastDayOfMonth);
      return { startDate: firstDay, endDate: lastDay };
    }

    case 'this_year': {
      return {
        startDate: startOfDay(year, 0, 1),
        endDate: endOfDay(year, 11, 31),
      };
    }

    case 'all_time':
    default: {
      return {
        startDate: new Date(0), // 1970-01-01
        endDate: new Date(Date.UTC(2099, 11, 31, 23, 59, 59, 999)),
      };
    }
  }
}
