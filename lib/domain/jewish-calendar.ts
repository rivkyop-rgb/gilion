/**
 * The Hebrew calendar, for a newspaper that lives by it.
 *
 * Two things the platform cannot answer on its own:
 *
 * 1. **A Hebrew date is written in gematria.** `Intl` with `ca-hebrew` and
 *    `day: "numeric"` renders "14 באלול", which is not how anyone writes a
 *    Hebrew date — it is י״ד באלול. `nu-hebr` fixes the digits but still gets
 *    the month spelling and the leap-year month (אדר א׳ / אדר ב׳) wrong often
 *    enough to matter.
 * 2. **There is no paper on a chag.** That is not a scheduling preference, it
 *    is a fact about the year, and deriving it requires the whole Hebrew
 *    calendar: molad, leap years, the postponement rules. Nothing in `Intl`
 *    exposes it.
 *
 * @hebcal/core is the standard implementation of both and is offline — no
 * network call sits between the user and a calendar cell.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */
import { flags, gematriya, HDate, HebrewCalendar } from "@hebcal/core";

/**
 * Israel, not the diaspora: one day of yom tov, no second-day chag.
 *
 * Hard-coded deliberately rather than guessed per user. It belongs in the
 * admin panel alongside the timezone (docs/plan/11-admin-panel.md) the day a
 * business outside Israel exists; until then a setting nobody can answer
 * differently is a setting that only adds a way to be wrong.
 */
const IN_ISRAEL = true;

export type DayKind =
  /** Yom tov — no newspaper is printed. */
  | "chag"
  /** The day before a chag: the paper comes out, and it is prime advertising. */
  | "erev_chag"
  /** Chol hamoed — the paper is printed as usual. */
  | "chol_hamoed"
  | "regular";

export type JewishDay = {
  /** Gematria, day and month only: "י״ד אלול". The year is implied by context. */
  hebrew: string;
  /** The holiday's Hebrew name, when the day has one. */
  holiday: string | null;
  kind: DayKind;
};

/** `YYYY-MM-DD` → a local `Date`, never `new Date(iso)` — see weekdayOf. */
function localDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** Month name in Hebrew letters, leap-year aware (אדר א׳ / אדר ב׳). */
function hebrewMonthName(hd: HDate): string {
  // renderGematriya gives "י״ד אלול תשפ״ו"; the middle is the month, and it is
  // taken from there rather than translated by hand so that Adar I/II in a leap
  // year comes out right without a special case here.
  const parts = hd.renderGematriya(true).split(" ");
  return parts.slice(1, -1).join(" ");
}

export function jewishDay(iso: string): JewishDay | null {
  const date = localDate(iso);
  if (!date) return null;

  const hd = new HDate(date);
  const hebrew = `${gematriya(hd.getDate())} ${hebrewMonthName(hd)}`;

  const events = HebrewCalendar.getHolidaysOnDate(hd, IN_ISRAEL) ?? [];
  let kind: DayKind = "regular";
  let holiday: string | null = null;

  for (const ev of events) {
    const f = ev.getFlags();
    const name = ev.render("he");
    if (f & flags.CHAG) {
      // A chag outranks anything else falling on the same day.
      return { hebrew, holiday: name, kind: "chag" };
    }
    if (f & flags.EREV) {
      kind = "erev_chag";
      holiday = name;
    } else if (kind === "regular" && /חוה״מ|חול המועד/.test(name)) {
      kind = "chol_hamoed";
      holiday = name;
    }
  }

  return { hebrew, holiday, kind };
}

/**
 * No newspaper comes out on a chag.
 *
 * Chol hamoed and fast days are NOT included: the paper is printed on those,
 * and treating them as closed would silently refuse legitimate dates.
 */
export function isNoPaperDay(iso: string): boolean {
  return jewishDay(iso)?.kind === "chag";
}

/** The reason a date cannot carry a publication, or null when it can. */
export function noPaperReason(iso: string): string | null {
  const day = jewishDay(iso);
  if (day?.kind !== "chag") return null;
  return `${day.holiday} — לא יוצא עיתון בחג`;
}

/**
 * A whole month in one pass.
 *
 * The calendar renders 31 cells and each one needs its Hebrew date and its
 * holiday; querying per cell rebuilds the same year's holiday table 31 times.
 */
export function jewishMonth(year: number, month: number): Map<string, JewishDay> {
  const out = new Map<string, JewishDay>();
  const last = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= last; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const day = jewishDay(iso);
    if (day) out.set(iso, day);
  }
  return out;
}
