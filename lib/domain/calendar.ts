/**
 * What day it is, for a publisher in Jerusalem.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Storage is UTC and display is `Asia/Jerusalem` (conventions.md §1), which
 * means every question of the form "is this date inside that range" has two
 * calendars in it and has to pick one. This module is the one place that
 * picks, so that the reminder countdown and the dashboard's idea of "this
 * week" cannot drift apart — they drift apart silently, and only during the
 * hours when Jerusalem has turned the page and UTC has not.
 *
 * Every Date this module returns is UTC midnight of a Jerusalem calendar day.
 * That is deliberately the same shape Prisma hands back for a `@db.Date`
 * column, so the values compare directly against `publication_date` without
 * anybody converting anything at the call site.
 */

export const PUBLISHER_ZONE = "Asia/Jerusalem";

const DAY_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: PUBLISHER_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Midnight-of-that-day, as a UTC timestamp, for a moment read in Jerusalem. */
export function jerusalemDayUtcMs(moment: Date): number {
  const [year, month, day] = DAY_PARTS.format(moment).split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

/** The same thing as a Date — what a `@db.Date` column is compared against. */
export function jerusalemDay(moment: Date): Date {
  return new Date(jerusalemDayUtcMs(moment));
}

const DAY_MS = 86_400_000;

export function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

export type DayRange = { from: Date; to: Date };

/**
 * "This week" — Sunday through Saturday, inclusive (validation rule 2).
 *
 * NOT seven days forward, and the difference is the whole point of the card.
 * A publisher asks "who is running this week" on Wednesday and means the
 * issues of this Sunday-to-Saturday, including the two that already came out.
 * A rolling seven-day window would answer a question nobody asked and would
 * quietly change its answer every morning.
 *
 * `getUTCDay()` on a UTC-midnight day is safe: the value was built from
 * Jerusalem parts, so its weekday is Jerusalem's weekday.
 */
export function weekRange(moment: Date): DayRange {
  const today = jerusalemDay(moment);
  const from = addDays(today, -today.getUTCDay());
  return { from, to: addDays(from, 6) };
}

/** `yyyy-MM-dd` — the form a date input and a query string both speak. */
export function isoDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}
