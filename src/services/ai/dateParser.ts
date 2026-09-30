/**
 * Isolated date parsing module for Monevo.
 * Handles natural language dates with timezone awareness (default: Africa/Lagos).
 */

const DAYS_OF_WEEK: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

export function formatDateToYYYYMMDD(date: Date, timezone = 'Africa/Lagos'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    // Fallback if timezone string is unrecognized
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

/**
 * Extracts and normalizes relative or natural language dates from text.
 * Returns ISO date format YYYY-MM-DD.
 */
export function parseNaturalDate(
  text: string,
  referenceDate: Date = new Date(),
  timezone = 'Africa/Lagos'
): string {
  const lower = text.toLowerCase();

  // 1. Explicit ISO date check (e.g. 2026-09-10)
  const isoMatch = lower.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return isoMatch[0];
  }

  // Calculate local date components in specified timezone
  const refDateStr = formatDateToYYYYMMDD(referenceDate, timezone);
  const [yearStr, monthStr, dayStr] = refDateStr.split('-');
  const refYear = parseInt(yearStr, 10);
  const refMonth = parseInt(monthStr, 10) - 1;
  const refDay = parseInt(dayStr, 10);

  const localDate = new Date(Date.UTC(refYear, refMonth, refDay, 12, 0, 0));

  // 2. "yesterday" or "last night"
  if (/\b(yesterday|last night)\b/.test(lower)) {
    const d = new Date(localDate);
    d.setUTCDate(d.getUTCDate() - 1);
    return formatDateToYYYYMMDD(d, timezone);
  }

  // 3. "today", "this morning", "this afternoon", "this evening", "tonight"
  if (/\b(today|this morning|this afternoon|this evening|tonight|now)\b/.test(lower)) {
    return formatDateToYYYYMMDD(localDate, timezone);
  }

  // 4. "last [weekday]" (e.g. "last Friday")
  const lastDayMatch = lower.match(/\blast\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/);
  if (lastDayMatch) {
    const targetDay = DAYS_OF_WEEK[lastDayMatch[1]];
    const currentDay = localDate.getUTCDay();
    let diff = (currentDay - targetDay + 7) % 7;
    if (diff === 0) diff = 7; // "last Friday" on a Friday means 7 days ago
    const d = new Date(localDate);
    d.setUTCDate(d.getUTCDate() - diff);
    return formatDateToYYYYMMDD(d, timezone);
  }

  // 5. Bare weekday (e.g. "on Monday", "paid on Friday")
  const bareDayMatch = lower.match(/\b(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (bareDayMatch) {
    const dayName = bareDayMatch[2];
    const targetDay = DAYS_OF_WEEK[dayName];
    const currentDay = localDate.getUTCDay();
    let diff = currentDay - targetDay;
    if (diff < 0) diff += 7;
    const d = new Date(localDate);
    d.setUTCDate(d.getUTCDate() - diff);
    return formatDateToYYYYMMDD(d, timezone);
  }

  // Default to today
  return formatDateToYYYYMMDD(localDate, timezone);
}
