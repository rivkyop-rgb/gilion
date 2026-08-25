/**
 * The ad shape catalogue (US-006).
 *
 * A shape belongs to a newspaper, so every query here is scoped through it
 * (conventions.md §2). That ownership is what makes `cols`/`rows` meaningful:
 * they are grid units, and a grid belongs to exactly one newspaper.
 */
import { Prisma } from "@prisma/client";

import { basePrisma, tenantDb } from "./db";
import type { Cell } from "@/lib/domain/slot-geometry";

export type AdShapeWrite = {
  name: string;
  cols: number;
  rows: number;
  position_mode: "anywhere" | "region";
  /** null when position_mode is "anywhere". Already normalized by the caller. */
  allowed_cells: Cell[] | null;
};

/** Largest first — area, then name. Replaces the old size_group ordering. */
function byArea<T extends { cols: number; rows: number; name: string }>(shapes: T[]): T[] {
  return [...shapes].sort(
    (a, b) => b.cols * b.rows - a.cols * a.rows || a.name.localeCompare(b.name, "he"),
  );
}

/** The cells of a stored region, or null for "anywhere on the page". */
export function readAllowedCells(value: unknown): Cell[] | null {
  if (!value || typeof value !== "object") return null;
  const cells = (value as { cells?: unknown }).cells;
  if (!Array.isArray(cells)) return null;
  return cells
    .filter((c): c is [number, number] => Array.isArray(c) && c.length === 2)
    .map(([col, row]) => [col, row] as Cell);
}

const writeAllowedCells = (cells: Cell[] | null) =>
  cells === null ? null : { cells: cells.map(([col, row]) => [col, row]) };

export async function listAdShapes(businessId: string, newspaperId: string) {
  const shapes = await tenantDb(businessId).adShape.findMany({
    where: { newspaper_id: newspaperId },
  });
  return byArea(shapes);
}

export async function getAdShape(businessId: string, id: string) {
  return tenantDb(businessId).adShape.findUnique({ where: { id } });
}

/** True when the name is taken by a *different* shape in the same newspaper. */
export async function adShapeNameTaken(
  businessId: string,
  newspaperId: string,
  name: string,
  exceptId?: string,
) {
  const found = await tenantDb(businessId).adShape.findFirst({
    where: {
      newspaper_id: newspaperId,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  return found !== null;
}

export async function createAdShape(businessId: string, newspaperId: string, data: AdShapeWrite) {
  // The shape hangs off the newspaper, so the parent must be verified to exist
  // in this tenant before writing through basePrisma.
  const paper = await tenantDb(businessId).newspaper.findUnique({
    where: { id: newspaperId },
    select: { id: true },
  });
  if (!paper) return null;

  return basePrisma.adShape.create({
    data: {
      newspaper_id: newspaperId,
      name: data.name,
      cols: data.cols,
      rows: data.rows,
      position_mode: data.position_mode,
      allowed_cells: writeAllowedCells(data.allowed_cells) ?? undefined,
    },
  });
}

export async function updateAdShape(businessId: string, id: string, data: AdShapeWrite) {
  const existing = await getAdShape(businessId, id);
  if (!existing) return null;

  return basePrisma.adShape.update({
    where: { id },
    data: {
      name: data.name,
      cols: data.cols,
      rows: data.rows,
      position_mode: data.position_mode,
      // Prisma needs DbNull to write an actual SQL NULL into a Json column;
      // plain `null` means "leave it alone", which would strand the old region
      // on a shape switched back to "anywhere" and violate the CHECK constraint.
      allowed_cells: writeAllowedCells(data.allowed_cells) ?? Prisma.DbNull,
    },
  });
}

export async function deleteAdShape(businessId: string, id: string) {
  const existing = await getAdShape(businessId, id);
  if (!existing) return null;
  // AllowedAdShape and PriceRule cascade — safe because Publication.price is a
  // copy taken at approval, never read back (conventions.md §7 rule 1).
  return basePrisma.adShape.delete({ where: { id } });
}

/**
 * Copies the base catalogue into a newspaper. Idempotent: a newspaper that
 * already has shapes is left alone, so re-running the seed cannot duplicate it.
 */
export async function copyBaseShapes(
  newspaperId: string,
  shapes: Array<AdShapeWrite & { id?: string }>,
) {
  const existing = await basePrisma.adShape.count({ where: { newspaper_id: newspaperId } });
  if (existing > 0) return { created: 0 };

  await basePrisma.adShape.createMany({
    data: shapes.map((s) => ({
      ...(s.id ? { id: s.id } : {}),
      newspaper_id: newspaperId,
      name: s.name,
      cols: s.cols,
      rows: s.rows,
      position_mode: s.position_mode,
      allowed_cells: writeAllowedCells(s.allowed_cells) ?? undefined,
    })),
  });
  return { created: shapes.length };
}

/** What deleting a shape would take with it, and what blocks the delete. */
export async function shapeUsage(businessId: string, id: string) {
  const db = tenantDb(businessId);
  const [pageTypes, priceRules] = await Promise.all([
    db.allowedAdShape.count({ where: { ad_shape_id: id } }),
    db.priceRule.count({ where: { ad_shape_id: id } }),
  ]);
  // Placement arrives in stage 06; the shape of the answer is here so the rule
  // does not have to be rediscovered then.
  return { pageTypes, priceRules, placements: 0 };
}

/**
 * Placements that would be orphaned by removing a shape from a page type
 * (validation rule 6). Zero until stage 06 introduces Placement.
 */
export async function placementsUsingShape(
  _businessId: string,
  _pageTypeId: string,
  _shapeId: string,
) {
  return 0;
}
