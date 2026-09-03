/**
 * Reserved areas — the part of a page that is not for sale (backlog item 14).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The request was for "a template, even for part of the page, plus a logo and
 * its position". The decision that shaped this file narrowed it to the smallest
 * thing that answers it: *"האזור נחסם לשיבוץ, והלוגו — מגדירים אותו רק פעם
 * אחת, הוא עולה לשם מיידית."* So there is no layout to compose and no template
 * entity to maintain — only a rectangle the page keeps for itself, and one
 * image that sits in it.
 *
 * This is deliberately NOT the `LayoutTemplate` deleted on 24/08/2026 and
 * replaced by the grid (conventions.md §7). That model said where ads GO, and
 * competed with the grid for authority over the page. This one only says where
 * they may not, in the same grid units as everything else.
 */
import { footprintMm, formatCm, type DerivedGrid } from "./grid";
import { deadSpaceCreatedBy, sizeLabel, type ShapeSpec } from "./placement";
import { overlaps, validateRect, type GridRect } from "./slot-geometry";

export type ReservationInput = {
  name: string;
  rect: GridRect;
};

export type ReservationRejection = { field: "name" | "area"; message: string };

/**
 * PNG and JPG only. An SVG is a document that can run script, and this one
 * would be served from the app's own origin — a logo is not worth that.
 */
export const RESERVATION_IMAGE_TYPES: ReadonlySet<string> = new Set(["jpg", "png"]);
export const RESERVATION_ACCEPT_ATTRIBUTE = "image/jpeg,image/png";

/** Longest name that still fits inside a small area on the board. */
export const RESERVATION_NAME_MAX = 40;

/**
 * Every reason an area may not be reserved where it was just drawn.
 *
 * `siblings` are the OTHER reserved areas of the same page type, and
 * `allowedShapes` the shapes that page type sells — both for the same reason
 * they matter to a placement.
 */
export function checkReservation(
  input: ReservationInput,
  grid: DerivedGrid,
  siblings: readonly GridRect[],
  allowedShapes: readonly ShapeSpec[],
): ReservationRejection | null {
  const name = input.name.trim();
  if (!name) return { field: "name", message: "לאזור שמור צריך שם" };
  if (name.length > RESERVATION_NAME_MAX) {
    return { field: "name", message: `השם ארוך מ־${RESERVATION_NAME_MAX} תווים` };
  }

  const bounds = validateRect(input.rect, grid);
  if (bounds) return { field: "area", message: bounds.message };

  for (const other of siblings) {
    if (overlaps(input.rect, other)) {
      return {
        field: "area",
        message: `השטח חופף לאזור שמור אחר (${sizeLabel(other, grid)})`,
      };
    }
  }

  // The same rule 7א a designer is held to, applied to the newspaper itself.
  // Reserving a band across the middle of the cover leaves two strips that
  // nothing in the catalogue fits — space the newspaper then cannot sell and
  // did not mean to give up. It is the identical failure, and there is no
  // reason the house should be exempt from a rule its customers live under.
  const remainder = deadSpaceCreatedBy(input.rect, siblings, grid, allowedShapes);
  if (remainder) {
    return {
      field: "area",
      message:
        `האזור משאיר שטח פנוי של ${sizeLabel(remainder, grid)} ` +
        `שאף צורה בקטלוג לא נכנסת בו — הזיזי אותו או שני את גודלו`,
    };
  }

  return null;
}

/** "לוגו העיתון · 8.0 × 3.0 ס״מ" — what the settings list shows per area. */
export function reservationLabel(
  area: { name: string; rect: GridRect },
  grid: DerivedGrid,
): string {
  return `${area.name} · ${sizeLabel(area.rect, grid)}`;
}

/** How much of the page the newspaper has kept, as a percentage of its area. */
export function reservedShare(areas: readonly GridRect[], grid: DerivedGrid): number {
  const total = grid.columns * grid.rows;
  if (total <= 0) return 0;
  const taken = areas.reduce((sum, r) => sum + r.cols * r.rows, 0);
  return Math.round((taken / total) * 100);
}

/** The area in millimetres — what the print step will eventually draw into. */
export function reservationFootprint(rect: GridRect, grid: DerivedGrid) {
  return footprintMm(rect, grid);
}

/** Centimetres, for a caption that has no room for the full size label. */
export function shortSize(rect: GridRect, grid: DerivedGrid): string {
  const { widthMm, heightMm } = footprintMm(rect, grid);
  return `${formatCm(widthMm)}×${formatCm(heightMm)}`;
}
