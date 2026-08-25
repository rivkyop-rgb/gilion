import { footprintMm, formatCm, type DerivedGrid } from "@/lib/domain/grid";

/**
 * How a shape's size is written everywhere in the settings screens: one unit,
 * centimetres, in both directions.
 *
 * Grid cells are an internal detail and are never shown. Columns were shown
 * here at one point, next to a height in centimetres — two units side by side,
 * which read as confusing rather than as precise (03-newspaper-config.md
 * deviation 11).
 */
export function shapeSize(shape: { cols: number; rows: number }, grid: DerivedGrid): string {
  const mm = footprintMm(shape, grid);
  return `${formatCm(mm.widthMm)} × ${formatCm(mm.heightMm)} ס״מ`;
}
