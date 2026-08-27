/**
 * A newspaper's print schedule (US-006).
 *
 * A newspaper is printed on a fixed set of weekdays. That is the whole model:
 * days 0..6, nothing else. The temptation is to store a recurrence here
 * ("every other week", "holiday eves") because that is how a customer talks
 * about a package — but those are not properties of the NEWSPAPER, they are
 * the specific dates one customer bought. An irregular run is expressed by the
 * dates ticked on the order; the schedule only answers one question: could an
 * issue physically come out that day?
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Index is the JS `getDay()` number, so the array doubles as the lookup. */
export const WEEKDAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"] as const;

export const WEEKDAY_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"] as const;

export function isWeekday(n: number): n is Weekday {
  return Number.isInteger(n) && n >= 0 && n <= 6;
}

/** Sorted, de-duplicated, out-of-range values dropped. */
export function normalizeDays(days: readonly number[]): Weekday[] {
  return [...new Set(days.filter(isWeekday))].sort((a, b) => a - b);
}

/**
 * Dates are handled as `YYYY-MM-DD` strings throughout, never as `Date`.
 *
 * `new Date("2026-08-25")` parses as UTC midnight, so in any timezone west of
 * Greenwich `getDay()` reports the previous day — a Tuesday paper silently
 * becoming a Monday one. Splitting the string and using the local constructor
 * is the fix, and it is why this function exists instead of being inlined.
 */
export function weekdayOf(isoDate: string): Weekday | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  // Rejects impossible dates that the regex accepts, e.g. 2026-02-31.
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date.getDay() as Weekday;
}

/** An empty schedule means "not declared" — every date passes, silently. */
export function hasSchedule(days: readonly number[]): boolean {
  return normalizeDays(days).length > 0;
}

export function isPublicationDay(days: readonly number[], isoDate: string): boolean {
  if (!hasSchedule(days)) return true;
  const weekday = weekdayOf(isoDate);
  if (weekday === null) return false;
  return normalizeDays(days).includes(weekday);
}

export function formatDays(days: readonly number[]): string {
  const normalized = normalizeDays(days);
  if (normalized.length === 0) return "לא הוגדרו ימי הדפסה";
  if (normalized.length === 1) return `יום ${WEEKDAY_LABELS[normalized[0]!]}`;
  const labels = normalized.map((d) => WEEKDAY_LABELS[d]);
  return `ימי ${labels.slice(0, -1).join(", ")} ו${labels.at(-1)}`;
}

/**
 * The warning shown when a date falls outside the schedule. Returns null when
 * there is nothing to say — the caller renders it or does not, and never has
 * to reproduce the condition.
 */
export function offScheduleWarning(
  days: readonly number[],
  isoDate: string,
  newspaperName: string,
): string | null {
  if (isPublicationDay(days, isoDate)) return null;
  const weekday = weekdayOf(isoDate);
  const dayName = weekday === null ? "התאריך שנבחר" : `יום ${WEEKDAY_LABELS[weekday]}`;
  return `${dayName} אינו יום הדפסה של "${newspaperName}" — ${formatDays(days)}. אפשר להמשיך אם זו מהדורה מיוחדת.`;
}

/**
 * The publication dates of a month, for the multi-date picker.
 *
 * Returns every day of the month with its ISO string and whether the paper
 * prints that day, so the calendar renders from one pass instead of computing
 * a weekday per cell.
 */
export type CalendarDay = {
  iso: string;
  day: number;
  weekday: Weekday;
  isPublicationDay: boolean;
  isPast: boolean;
};

export function monthDays(
  year: number,
  month: number,
  days: readonly number[],
  today: string,
): CalendarDay[] {
  const out: CalendarDay[] = [];
  const scheduled = normalizeDays(days);
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const weekday = new Date(year, month, d).getDay() as Weekday;
    out.push({
      iso,
      day: d,
      weekday,
      isPublicationDay: scheduled.length === 0 || scheduled.includes(weekday),
      isPast: iso < today,
    });
  }
  return out;
}

/** Today as `YYYY-MM-DD` in the *local* zone — see the note on weekdayOf. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/*
 * The Hebrew date used to be rendered here with Intl. It moved to
 * lib/domain/jewish-calendar.ts, which writes it in gematria and also knows
 * which days are a chag — neither of which Intl can do. See the note there.
 */
