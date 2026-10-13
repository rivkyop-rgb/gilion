/**
 * When the next issue comes out (US-007, FR-6).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * ── Why this is not one line ─────────────────────────────────────────────────
 * "The next Tuesday" is one line. What a publisher actually needs is the next
 * date this newspaper PRINTS, which is a weekday from its own schedule, minus
 * the days no newspaper prints at all. Yom tov is not a day the paper skips by
 * choice — nobody is at the press — so an issue proposed for one is not a
 * warning to click past, it is a date that has to be replaced.
 *
 * The eve of a chag is the opposite and is worth saying out loud: the paper
 * comes out, and it is the most valuable issue of the season. It is flagged so
 * a person knows what they are looking at, never blocked.
 */
import { isNoPaperDay, jewishDay } from "./jewish-calendar";
import { isPublicationDay, hasSchedule } from "./publication-days";

/** How far ahead to look before giving up. Two months of any schedule. */
const HORIZON_DAYS = 70;

export type IssueDateNote =
  /** Yom tov — no paper is printed at all. The date must be replaced. */
  | { kind: "no_paper"; message: string }
  /** The eve of a chag: it prints, and it is the issue people fight over. */
  | { kind: "erev_chag"; message: string }
  /** Not one of this newspaper's printing days — legal, but deliberate. */
  | { kind: "off_schedule"; message: string };

export type IssueDateSuggestion = {
  /** yyyy-mm-dd. */
  date: string;
  /** Everything worth saying about it. Empty for an ordinary printing day. */
  notes: IssueDateNote[];
  /** True when nothing here blocks the date — notes may still be present. */
  usable: boolean;
};

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** yyyy-mm-dd → UTC midnight, matching how @db.Date round-trips. */
function fromIso(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Everything worth telling someone about a date, before they commit to it. */
export function notesFor(date: string, publicationDays: readonly number[]): IssueDateNote[] {
  const notes: IssueDateNote[] = [];

  const noPaper = isNoPaperDay(date);
  if (noPaper) {
    const day = jewishDay(date);
    notes.push({
      kind: "no_paper",
      message: `${day?.holiday ?? "חג"} — לא יוצא עיתון בחג`,
    });
  }

  if (jewishDay(date)?.kind === "erev_chag") {
    const day = jewishDay(date);
    notes.push({
      kind: "erev_chag",
      message: `ערב ${day?.holiday ?? "חג"} — העיתון יוצא, וזה הגיליון המבוקש של העונה`,
    });
  }

  // Only worth saying when the newspaper HAS a schedule: an empty list means
  // "no schedule declared", which is not the same as "never prints".
  if (hasSchedule(publicationDays) && !isPublicationDay(publicationDays, date)) {
    notes.push({
      kind: "off_schedule",
      message: "התאריך אינו אחד מימי ההוצאה של העיתון",
    });
  }

  return notes;
}

/** A date is usable unless no paper is printed on it at all. */
export function isUsableDate(notes: readonly IssueDateNote[]): boolean {
  return !notes.some((n) => n.kind === "no_paper");
}

export function describeDate(
  date: string,
  publicationDays: readonly number[],
): IssueDateSuggestion {
  const notes = notesFor(date, publicationDays);
  return { date, notes, usable: isUsableDate(notes) };
}

/**
 * The next date this newspaper prints after the one given.
 *
 * Walks forward a day at a time rather than jumping to the next matching
 * weekday, because the answer has to skip yom tov as well — and a chag can
 * take out the printing day itself, in which case the honest answer is the
 * following printing day, not the day after the chag.
 *
 * Returns null when the newspaper has no schedule at all: there is nothing to
 * compute from, and guessing "a week later" would be inventing a policy.
 */
export function nextIssueDate(
  afterDate: string,
  publicationDays: readonly number[],
): IssueDateSuggestion | null {
  const start = fromIso(afterDate);
  if (!start || !hasSchedule(publicationDays)) return null;

  for (let offset = 1; offset <= HORIZON_DAYS; offset++) {
    const candidate = iso(addDays(start, offset));
    if (!isPublicationDay(publicationDays, candidate)) continue;
    if (isNoPaperDay(candidate)) continue;
    return describeDate(candidate, publicationDays);
  }
  return null;
}

/**
 * The next few printing dates, for a person choosing rather than accepting.
 *
 * Includes dates the schedule skips nothing about — the point is to offer a
 * short list somebody can pick from when the obvious answer lands badly, not
 * to re-open the whole calendar.
 */
export function upcomingIssueDates(
  afterDate: string,
  publicationDays: readonly number[],
  count = 4,
): IssueDateSuggestion[] {
  const start = fromIso(afterDate);
  if (!start || !hasSchedule(publicationDays)) return [];

  const out: IssueDateSuggestion[] = [];
  for (let offset = 1; offset <= HORIZON_DAYS && out.length < count; offset++) {
    const candidate = iso(addDays(start, offset));
    if (!isPublicationDay(publicationDays, candidate)) continue;
    if (isNoPaperDay(candidate)) continue;
    out.push(describeDate(candidate, publicationDays));
  }
  return out;
}

/** How far ahead an issue opens by itself (the user, 12/10/2026). */
export const AUTO_OPEN_DAYS = 7;

/**
 * Which issues should exist by now and do not (the user, 12/10/2026).
 *
 * An issue opens by itself at the EARLIER of two moments: the previous issue
 * of the same newspaper closing, or a week before its date. So:
 *
 *  - every printing day from today to a week ahead;
 *  - every date in that week that already has a publication sold on it, even
 *    off the schedule — a special edition with ads waiting is an issue;
 *  - the first printing day after the last CLOSED issue, however far off.
 *
 * Days no newspaper prints (yom tov) are never opened. Dates that already
 * have an issue are dropped. Nothing before today — an issue that should have
 * been opened in the past is a decision for a person, not a gap to backfill.
 */
export function autoOpenDates(input: {
  today: string;
  publicationDays: readonly number[];
  lastClosedDate: string | null;
  soldDates: readonly string[];
  existingDates: readonly string[];
}): string[] {
  const start = fromIso(input.today);
  if (!start) return [];
  const until = iso(addDays(start, AUTO_OPEN_DAYS));
  const wanted = new Set<string>();

  if (hasSchedule(input.publicationDays)) {
    for (let offset = 0; offset <= AUTO_OPEN_DAYS; offset++) {
      const day = iso(addDays(start, offset));
      if (isPublicationDay(input.publicationDays, day) && !isNoPaperDay(day)) wanted.add(day);
    }
  }
  for (const day of input.soldDates) {
    if (day >= input.today && day <= until && !isNoPaperDay(day)) wanted.add(day);
  }
  if (input.lastClosedDate) {
    const next = nextIssueDate(input.lastClosedDate, input.publicationDays);
    if (next && next.date >= input.today) wanted.add(next.date);
  }

  const existing = new Set(input.existingDates);
  return [...wanted].filter((d) => !existing.has(d)).sort();
}
