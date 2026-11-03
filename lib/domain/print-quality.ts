/**
 * `Newspaper.print_quality` → what Chromium actually does about it (FR-22).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The field is FREE TEXT in docs/erd.md and stays that way. There is no dpi
 * picker, no CMYK and no bleed anywhere in this product — those came out of the
 * Stitch mockups and out of neither prd.md nor erd.md (docs/design/gaps.md §א),
 * and a validator for them would be a rule nobody wrote.
 *
 * So this maps three RECOGNISED words onto a device scale factor and lets every
 * other string fall to `standard`. That is the whole contract: a publisher who
 * types "מבריק" gets a perfectly good PDF at the ordinary scale rather than an
 * error about a field that was never a closed list.
 *
 * The scale factor is what decides how the ARTWORK is rasterised — the page
 * geometry is vector either way and does not move. Doubling it doubles the
 * pixels behind every ad and roughly doubles the file; three is the ceiling
 * because past it a tabloid page stops fitting comfortably in memory for
 * nothing a press can print.
 */

export const PRINT_QUALITIES = ["draft", "standard", "high"] as const;

export type PrintQuality = (typeof PRINT_QUALITIES)[number];

export const PRINT_QUALITY_LABELS: Record<PrintQuality, string> = {
  draft: "טיוטה — קל ומהיר",
  standard: "רגילה",
  high: "גבוהה — לדפוס",
};

export const PRINT_QUALITY_HINTS: Record<PrintQuality, string> = {
  draft: "קובץ קטן ומהיר. טוב לבדיקה ולשליחה במייל, לא לבית הדפוס.",
  standard: "מתאים לרוב בתי הדפוס של עיתונים. זו ברירת המחדל.",
  high: "המודעות נשמרות בחדות מרבית. הקובץ כפול בגודלו — כדאי כשבית הדפוס מבקש.",
};

const SCALE: Record<PrintQuality, number> = {
  draft: 1,
  standard: 2,
  high: 3,
};

/** The recognised word, or `standard` for anything else — including empty. */
export function normalizePrintQuality(value: string | null | undefined): PrintQuality {
  const key = (value ?? "").trim().toLowerCase();
  return (PRINT_QUALITIES as readonly string[]).includes(key) ? (key as PrintQuality) : "standard";
}

/** Chromium's `deviceScaleFactor` for a stored print_quality string. */
export function printQualityScale(value: string | null | undefined): number {
  return SCALE[normalizePrintQuality(value)];
}
