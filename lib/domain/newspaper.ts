/**
 * Newspaper configuration rules (US-006, FR-21).
 * Pure module — no Prisma, no React (conventions.md §9).
 */
import { isPageSizeKey, pageDimensions, type PageSizeKey } from "./page-size";
import { validateGridSettings } from "./grid";
import { UPLOAD_TRANSPORT_LIMIT_BYTES } from "./ad-file";

export type NewspaperInput = {
  name: string;
  pageSize: string;
  customWidthMm?: number | null;
  customHeightMm?: number | null;
  /** Millimetres. */
  margin: number;
  printQuality: string;
  /** Megabytes as typed by the user; stored as bytes. */
  maxAdFileSizeMb: number;
  /** Page grid — see lib/domain/grid.ts. */
  columns: number;
  /** Millimetres, one grid row. */
  rowHeightMm: number;
  /** Millimetres, between cells and against the frame. */
  gutterMm: number;
};

export type FieldError = { field: string; message: string };

export const DEFAULT_MAX_AD_FILE_SIZE_MB = 10;
const MB = 1024 * 1024;

export const toBytes = (mb: number) => Math.round(mb * MB);
export const toMegabytes = (bytes: number) => Math.round((bytes / MB) * 100) / 100;

export function validateNewspaper(input: NewspaperInput): FieldError[] {
  const errors: FieldError[] = [];
  const name = input.name?.trim() ?? "";

  // rule 1 — uniqueness inside the business is enforced by the DB; this is the
  // presence check.
  if (!name) errors.push({ field: "name", message: "שם העיתון הוא שדה חובה" });

  // rule 4 — closed list plus custom
  if (!isPageSizeKey(input.pageSize)) {
    errors.push({ field: "pageSize", message: "גודל עמוד לא מוכר" });
  }

  const dims = pageDimensions(input.pageSize, input.customWidthMm, input.customHeightMm);
  if (input.pageSize === "custom" && !dims) {
    errors.push({ field: "customWidthMm", message: "בגודל מותאם אישית יש להזין רוחב וגובה במ״מ" });
  }

  // rule 2 — margin must leave a usable page
  if (!Number.isFinite(input.margin) || input.margin < 0) {
    errors.push({ field: "margin", message: "השוליים חייבים להיות אפס או יותר" });
  } else if (dims) {
    const smallest = Math.min(dims.width, dims.height);
    if (input.margin >= smallest / 2) {
      errors.push({
        field: "margin",
        message: `השוליים גדולים מדי — בגודל עמוד זה הם חייבים להיות פחות מ־${Math.floor(smallest / 2)} מ״מ`,
      });
    }
  }

  // rule 3 — the newspaper is the only source of the upload limit (FR-21)
  if (!Number.isFinite(input.maxAdFileSizeMb) || input.maxAdFileSizeMb <= 0) {
    errors.push({ field: "maxAdFileSizeMb", message: "גודל קובץ מקסימלי חייב להיות גדול מאפס" });
  } else if (input.maxAdFileSizeMb * 1024 * 1024 > UPLOAD_TRANSPORT_LIMIT_BYTES) {
    // A limit the request itself cannot carry is worse than a lower limit: the
    // upload would fail with a framework error instead of a readable refusal.
    errors.push({
      field: "maxAdFileSizeMb",
      message: `גודל קובץ מקסימלי אינו יכול לעלות על ${UPLOAD_TRANSPORT_LIMIT_BYTES / (1024 * 1024)} MB`,
    });
  }

  if (!input.printQuality?.trim()) {
    errors.push({ field: "printQuality", message: "איכות דפוס היא שדה חובה" });
  }

  // rule 7 — the page grid (US-006 AC-4)
  errors.push(
    ...validateGridSettings({
      pageSize: input.pageSize,
      customWidthMm: input.customWidthMm,
      customHeightMm: input.customHeightMm,
      marginMm: input.margin,
      columns: input.columns,
      rowHeightMm: input.rowHeightMm,
      gutterMm: input.gutterMm,
    }),
  );

  return errors;
}

/** Blocking message when a page type is still referenced (rule 5). */
export function pageTypeDeletionBlocked(counts: { issuePages: number }): string | null {
  if (counts.issuePages === 0) return null;
  return `לא ניתן למחוק את סוג העמוד — הוא בשימוש ב־${counts.issuePages} עמודי גיליון.`;
}

/** Blocking message when an allowed shape is still placed somewhere (rule 6). */
export function allowedShapeRemovalBlocked(
  placementCount: number,
  shapeName: string,
): string | null {
  if (placementCount === 0) return null;
  return `לא ניתן להסיר את "${shapeName}" — ${placementCount} שיבוצים בגיליונות משתמשים בה בסוג העמוד הזה.`;
}

/**
 * Blocking message when a shape itself is being deleted (US-006 AC-5).
 *
 * Only live placements block: permissions and price rules cascade, and that is
 * safe because Publication.price is a copy taken at approval, never read back
 * from PriceRule (conventions.md §7 rule 1).
 */
export function shapeDeletionBlocked(counts: { placements: number }): string | null {
  if (counts.placements === 0) return null;
  return `לא ניתן למחוק את הצורה — ${counts.placements} שיבוצים בגיליונות משתמשים בה.`;
}

export type { PageSizeKey };
