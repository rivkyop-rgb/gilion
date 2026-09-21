/**
 * The four questions US-010 actually asks, as filters (AC-2, AC-3).
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The report screen was designed as a table with a status column, which answers
 * these four questions only if you already know which combination of three
 * enums each one means. They are not obscure questions — they are the whole
 * job — so each gets a chip, and the chip owns the definition.
 *
 * Kept here rather than as a `where` clause in lib/data, because the same four
 * definitions have to drive the counts on the chips and the rows in the table,
 * and two copies would eventually disagree about one status.
 */

export type PublicationLens = "all" | "running" | "missing_ad" | "unplaced" | "owing";

export const LENS_LABELS: Record<PublicationLens, string> = {
  all: "הכול",
  running: "מי מפרסם",
  missing_ad: "למי חסרה מודעה",
  unplaced: "מי לא שובץ",
  owing: "מי חייב כסף",
};

/** The sentence under the table, so the chip is not the only definition. */
export const LENS_EXPLANATIONS: Record<PublicationLens, string> = {
  all: "כל הפרסומים בתקופה, כולל מבוטלים.",
  running: "פרסומים שעתידים לצאת או שכבר יצאו — כל מה שאינו מבוטל.",
  missing_ad: "פרסומים שעדיין אין להם קובץ מודעה.",
  unplaced: "פרסומים שטרם שובצו לעמוד בגיליון.",
  owing: "פרסומים שכבר יצאו ולא שולמו.",
};

export type ReportablePublication = {
  status: string;
  placementStatus: string;
  paymentStatus: string;
  hasAdvertisement: boolean;
};

/** Publication states that mean the ad has already appeared in print. */
const RAN = ["published", "billed"];

/**
 * Whether one publication belongs under one chip.
 *
 * `unplaced` deliberately ignores publications that already ran: a published
 * ad has no placement to chase, and counting it would make the list of "not
 * laid out yet" grow forever as the archive does.
 */
export function matchesLens(p: ReportablePublication, lens: PublicationLens): boolean {
  switch (lens) {
    case "all":
      return true;
    case "running":
      return p.status !== "canceled";
    case "missing_ad":
      return p.status !== "canceled" && !p.hasAdvertisement;
    case "unplaced":
      return p.status !== "canceled" && !RAN.includes(p.status) && p.placementStatus !== "placed";
    case "owing":
      return RAN.includes(p.status) && p.paymentStatus !== "paid";
  }
}

/** How many rows each chip would show — rendered on the chip itself. */
export function lensCounts(rows: ReportablePublication[]): Record<PublicationLens, number> {
  const counts = { all: 0, running: 0, missing_ad: 0, unplaced: 0, owing: 0 };
  for (const row of rows) {
    for (const lens of Object.keys(counts) as PublicationLens[]) {
      if (matchesLens(row, lens)) counts[lens] += 1;
    }
  }
  return counts;
}
