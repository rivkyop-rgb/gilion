/**
 * Newspaper configuration rules (US-006, FR-21).
 * Pure module — no Prisma, no React (conventions.md §9).
 */
import { isPageSizeKey, pageDimensions, type PageSizeKey } from "./page-size";

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
  }

  if (!input.printQuality?.trim()) {
    errors.push({ field: "printQuality", message: "איכות דפוס היא שדה חובה" });
  }

  return errors;
}

/** Blocking message when a page type is still referenced (rule 5). */
export function pageTypeDeletionBlocked(counts: {
  templatePages: number;
  issuePages: number;
}): string | null {
  const parts: string[] = [];
  if (counts.templatePages > 0) parts.push(`${counts.templatePages} עמודי תבנית`);
  if (counts.issuePages > 0) parts.push(`${counts.issuePages} עמודי גיליון`);
  if (parts.length === 0) return null;
  return `לא ניתן למחוק את סוג העמוד — הוא בשימוש ב־${parts.join(" וב־")}.`;
}

/** Blocking message when an allowed shape is still used by a slot (rule 6). */
export function allowedShapeRemovalBlocked(slotCount: number, shapeName: string): string | null {
  if (slotCount === 0) return null;
  return `לא ניתן להסיר את "${shapeName}" — ${slotCount} סלוטים בתבניות משתמשים בה בסוג העמוד הזה.`;
}

export type { PageSizeKey };
