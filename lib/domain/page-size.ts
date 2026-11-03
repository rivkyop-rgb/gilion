/**
 * Newspaper page sizes (US-006 validation rule 4).
 *
 * A closed list plus "custom". Deliberately no dpi, CMYK or bleed anywhere —
 * those appeared in the Stitch mockups but are not in the ERD
 * (docs/design/gaps.md §א).
 */

export type PageSizeKey = "A4" | "A3" | "Tabloid" | "Berliner" | "Broadsheet" | "custom";

export const PAGE_SIZES: Record<
  Exclude<PageSizeKey, "custom">,
  { width: number; height: number }
> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  Tabloid: { width: 279, height: 432 },
  Berliner: { width: 315, height: 470 },
  Broadsheet: { width: 597, height: 749 },
};

export const PAGE_SIZE_KEYS: PageSizeKey[] = [
  "A4",
  "A3",
  "Tabloid",
  "Berliner",
  "Broadsheet",
  "custom",
];

export const PAGE_SIZE_LABELS: Record<PageSizeKey, string> = {
  A4: "A4 — 210×297 מ״מ",
  A3: "A3 — 297×420 מ״מ",
  Tabloid: "טאבלויד — 279×432 מ״מ",
  Berliner: "ברלינר — 315×470 מ״מ",
  Broadsheet: "ברודשיט — 597×749 מ״מ",
  custom: "מותאם אישית",
};

/**
 * What each size IS, in the words of someone who holds newspapers rather than
 * paper specs (the user, 03/11/2026: "לא ברור לי מה זה טאבלויד").
 */
export const PAGE_SIZE_HINTS: Record<PageSizeKey, string> = {
  A4: "גודל דף מדפסת רגיל. מתאים לעלון או לחוברת קטנה.",
  A3: "כפול מ־A4. מתאים לעלון מקופל או למקומון קטן.",
  Tabloid: "הגודל של רוב המקומונים והשבועונים: 27.9 × 43.2 ס״מ. עיתון שנפתח כמו מגזין גדול.",
  Berliner: "מעט גדול מטאבלויד: 31.5 × 47 ס״מ. נפוץ בעיתונים יומיים באירופה.",
  Broadsheet: "העיתון הגדול והרחב (כמו עיתון יומי מסורתי), שמקפלים לשניים כדי לקרוא.",
  custom: "גודל אחר — מקלידים רוחב וגובה בס״מ.",
};

export function isPageSizeKey(value: string): value is PageSizeKey {
  return (PAGE_SIZE_KEYS as string[]).includes(value);
}

/** Millimetres for a newspaper, resolving "custom" from its own columns. */
export function pageDimensions(
  pageSize: string,
  customWidthMm?: number | null,
  customHeightMm?: number | null,
): { width: number; height: number } | null {
  if (pageSize === "custom") {
    if (!customWidthMm || !customHeightMm) return null;
    return { width: customWidthMm, height: customHeightMm };
  }
  return isPageSizeKey(pageSize) && pageSize !== "custom" ? PAGE_SIZES[pageSize] : null;
}
