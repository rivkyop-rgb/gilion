"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import {
  allowedShapeRemovalBlocked,
  pageTypeDeletionBlocked,
  shapeDeletionBlocked,
  toBytes,
  validateNewspaper,
} from "@/lib/domain/newspaper";
import {
  cmToMm,
  colsForWidthCm,
  footprintMm,
  formatCm,
  rowsForHeightCm,
  shapeFitsGrid,
} from "@/lib/domain/grid";
import { normalizePositions, validPositionCount, type Cell } from "@/lib/domain/slot-geometry";
import { validatePrice } from "@/lib/domain/pricing";
import { normalizeDays } from "@/lib/domain/publication-days";
import * as papers from "@/lib/data/newspapers";
import * as shapes from "@/lib/data/ad-shapes";

export type FormState = { errors?: Record<string, string>; message?: string };

/** Newspaper configuration is admin-only (FR-8, stage 03 permission table). */
async function requireAdmin() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");
  return ctx;
}

/**
 * Every page measurement arrives from the form in CENTIMETRES and is stored in
 * millimetres. The conversion happens here, once, at the boundary — the domain,
 * the database and the PDF all speak millimetres and never see a centimetre.
 */
const newspaperSchema = z.object({
  name: z.string(),
  pageSize: z.string(),
  customWidthCm: z.coerce.number().optional().nullable(),
  customHeightCm: z.coerce.number().optional().nullable(),
  marginCm: z.coerce.number(),
  printQuality: z.string(),
  maxAdFileSizeMb: z.coerce.number(),
  columns: z.coerce.number(),
  rowHeightCm: z.coerce.number(),
  gutterCm: z.coerce.number(),
  /** Checkbox group: absent when nothing is ticked, one entry per ticked day. */
  publicationDays: z.array(z.coerce.number()),
});

function readNewspaper(formData: FormData) {
  const parsed = newspaperSchema.safeParse({
    name: formData.get("name"),
    pageSize: formData.get("pageSize"),
    customWidthCm: formData.get("customWidthCm") || null,
    customHeightCm: formData.get("customHeightCm") || null,
    marginCm: formData.get("marginCm"),
    printQuality: formData.get("printQuality"),
    maxAdFileSizeMb: formData.get("maxAdFileSizeMb"),
    columns: formData.get("columns"),
    rowHeightCm: formData.get("rowHeightCm"),
    gutterCm: formData.get("gutterCm"),
    publicationDays: formData.getAll("publicationDays"),
  });
  if (!parsed.success) return null;

  const cm = parsed.data;
  return {
    name: cm.name,
    pageSize: cm.pageSize,
    customWidthMm: cm.customWidthCm == null ? null : cmToMm(cm.customWidthCm),
    customHeightMm: cm.customHeightCm == null ? null : cmToMm(cm.customHeightCm),
    margin: cmToMm(cm.marginCm),
    printQuality: cm.printQuality,
    maxAdFileSizeMb: cm.maxAdFileSizeMb,
    columns: cm.columns,
    rowHeightMm: cmToMm(cm.rowHeightCm),
    gutterMm: cmToMm(cm.gutterCm),
    publicationDays: normalizeDays(cm.publicationDays),
  };
}

const toWrite = (input: NonNullable<ReturnType<typeof readNewspaper>>) => ({
  name: input.name.trim(),
  page_size: input.pageSize,
  custom_width_mm: input.pageSize === "custom" ? (input.customWidthMm ?? null) : null,
  custom_height_mm: input.pageSize === "custom" ? (input.customHeightMm ?? null) : null,
  margin: input.margin,
  print_quality: input.printQuality.trim(),
  // Typed in MB, stored in bytes — the newspaper is the only source of the
  // upload limit (FR-21).
  max_ad_file_size: toBytes(input.maxAdFileSizeMb),
  columns: input.columns,
  row_height_mm: input.rowHeightMm,
  gutter_mm: input.gutterMm,
  // Empty stays empty: "no schedule declared" is a real state, and the order
  // builder reads it as "don't warn about any date".
  publication_days: input.publicationDays,
});

export async function createNewspaperAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const input = readNewspaper(formData);
  if (!input) return { message: "הטופס לא נשלח כראוי" };

  const errors = validateNewspaper(input);
  if (errors.length) return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };

  if (await papers.newspaperNameTaken(ctx.businessId, input.name.trim())) {
    return { errors: { name: "כבר קיים עיתון בשם הזה" } };
  }

  // Also stocks the shape catalogue from the base set — see createNewspaper.
  const created = await papers.createNewspaper(ctx.businessId, toWrite(input));
  revalidatePath("/settings/newspapers");
  redirect(`/settings/newspapers/${created.id}`);
}

export async function updateNewspaperAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const input = readNewspaper(formData);
  if (!input) return { message: "הטופס לא נשלח כראוי" };

  const errors = validateNewspaper(input);
  if (errors.length) return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };

  if (await papers.newspaperNameTaken(ctx.businessId, input.name.trim(), id)) {
    return { errors: { name: "כבר קיים עיתון בשם הזה" } };
  }

  await papers.updateNewspaper(ctx.businessId, id, toWrite(input));
  revalidatePath(`/settings/newspapers/${id}`);
  return { message: "נשמר" };
}

export async function createPageTypeAction(
  newspaperId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { errors: { name: "שם סוג העמוד הוא שדה חובה" } };

  // Checked here rather than left to the unique index: an unhandled
  // P2002 crashes the action, and the screen just stops responding with no
  // message at all — which reads as "the button is broken".
  if (await papers.pageTypeNameTaken(ctx.businessId, newspaperId, name)) {
    return { errors: { name: "כבר קיים סוג עמוד בשם הזה בעיתון" } };
  }

  const created = await papers.createPageType(ctx.businessId, newspaperId, name);
  if (!created) return { message: "העיתון לא נמצא" };

  revalidatePath(`/settings/newspapers/${newspaperId}`);
  return {};
}

export async function deletePageTypeAction(
  newspaperId: string,
  pageTypeId: string,
): Promise<FormState> {
  const ctx = await requireAdmin();

  // Rule 5: a page type still used by an issue page cannot go.
  const blocked = pageTypeDeletionBlocked(await papers.pageTypeUsage(ctx.businessId, pageTypeId));
  if (blocked) return { message: blocked };

  await papers.deletePageType(ctx.businessId, pageTypeId);
  revalidatePath(`/settings/newspapers/${newspaperId}`);
  return {};
}

export async function setAllowedShapesAction(
  newspaperId: string,
  pageTypeId: string,
  shapeIds: string[],
): Promise<FormState> {
  const ctx = await requireAdmin();

  const pageType = await papers.getPageType(ctx.businessId, pageTypeId);
  if (!pageType) return { message: "סוג העמוד לא נמצא" };

  // Rule 6: removing a shape that placements still use would orphan them.
  const removing = pageType.allowed_shapes
    .map((a) => a.ad_shape_id)
    .filter((id) => !shapeIds.includes(id));

  for (const shapeId of removing) {
    const used = await shapes.placementsUsingShape(ctx.businessId, pageTypeId, shapeId);
    const shape = await shapes.getAdShape(ctx.businessId, shapeId);
    const blocked = allowedShapeRemovalBlocked(used, shape?.name ?? "הצורה");
    if (blocked) return { message: blocked };
  }

  await papers.setAllowedShapes(ctx.businessId, pageTypeId, shapeIds);
  revalidatePath(`/settings/newspapers/${newspaperId}`);
  return {};
}

export async function upsertPriceRuleAction(
  newspaperId: string,
  pageTypeId: string,
  adShapeId: string,
  rawPrice: string,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const trimmed = rawPrice.trim();
  // An empty cell means "no default price", not ₪0 — the row is removed.
  const price = trimmed === "" ? null : Number(trimmed);

  if (price !== null) {
    const invalid = validatePrice(price);
    if (invalid) return { message: invalid };
  }

  const result = await papers.upsertPriceRule(
    ctx.businessId,
    newspaperId,
    pageTypeId,
    adShapeId,
    price,
  );
  if (!result) return { message: "העיתון לא נמצא" };

  revalidatePath(`/settings/newspapers/${newspaperId}/pricing`);
  return {};
}

/* ---------------------------------------------------------------- ad shapes */

/**
 * A shape is sized in CENTIMETRES, both ways. Each dimension is snapped to the
 * nearest whole column or row here, against the newspaper's own grid — the
 * client shows the same conversion live, but the server never trusts the cell
 * counts it computed.
 */
const shapeSchema = z.object({
  name: z.string(),
  widthCm: z.coerce.number(),
  heightCm: z.coerce.number(),
  positionMode: z.enum(["anywhere", "region"]),
  /** [[col, row], …] as posted by the region picker. */
  allowedCells: z.array(z.tuple([z.number().int(), z.number().int()])).optional(),
});

type ShapeInput = z.infer<typeof shapeSchema>;

/**
 * What `prepareShape` accepts. The size arrives as centimetres from the form,
 * and as cells from `setShapeRegionAction`, which re-saves a shape whose size
 * was already resolved and must not be rounded a second time.
 */
type PrepareShapeInput = Omit<ShapeInput, "widthCm" | "heightCm"> &
  ({ widthCm: number; heightCm: number } | { cols: number; rows: number });

function readShape(formData: FormData) {
  const raw = String(formData.get("allowedCells") ?? "[]");
  let cells: unknown = [];
  try {
    cells = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = shapeSchema.safeParse({
    name: formData.get("name"),
    widthCm: formData.get("widthCm"),
    heightCm: formData.get("heightCm"),
    positionMode: formData.get("positionMode"),
    allowedCells: cells,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Validates a shape against the grid it will be measured in, and turns the
 * posted region into its stored form.
 *
 * Every rule here needs the newspaper's grid, which is why the actions resolve
 * it first rather than trusting numbers off the wire.
 */
type PreparedShape = { ok: true; data: shapes.AdShapeWrite } | { ok: false; state: FormState };

async function prepareShape(
  businessId: string,
  newspaperId: string,
  input: PrepareShapeInput,
): Promise<PreparedShape> {
  const name = input.name.trim();
  if (!name) return { ok: false, state: { errors: { name: "שם הצורה הוא שדה חובה" } } };

  const resolved = await papers.newspaperGrid(businessId, newspaperId);
  if (!resolved) return { ok: false, state: { message: "העיתון לא נמצא" } };
  const { grid } = resolved;

  // Centimetres become whole cells here. Deliberately NOT clamped: a request
  // bigger than the page has to survive as a too-large number so the check
  // below can refuse it, instead of being silently trimmed to something the
  // user never asked for.
  const cols = "cols" in input ? input.cols : colsForWidthCm(input.widthCm, grid);
  const rows = "rows" in input ? input.rows : rowsForHeightCm(input.heightCm, grid);

  // Separate message from the one below: with native validation off, an empty
  // number field posts as 0, and "too large for the page" would be nonsense.
  if (cols < 1 || rows < 1) {
    return {
      ok: false,
      state: { errors: { size: "רוחב וגובה חייבים להיות גדולים מאפס" } },
    };
  }

  if (!shapeFitsGrid({ cols, rows }, grid)) {
    const max = footprintMm({ cols: grid.columns, rows: grid.rows }, grid);
    return {
      ok: false,
      state: {
        errors: {
          size: `הצורה גדולה מהעמוד — לכל היותר ${formatCm(max.widthMm)} × ${formatCm(max.heightMm)} ס״מ`,
        },
      },
    };
  }

  const footprint = { cols, rows };

  const region =
    input.positionMode === "anywhere"
      ? null
      : normalizePositions((input.allowedCells ?? []) as Cell[], footprint, grid);

  if (region !== null && validPositionCount(footprint, region, grid) === 0) {
    return {
      ok: false,
      state: { message: "האזור המותר לא מכיל אף מיקום חוקי לצורה בגודל הזה" },
    };
  }

  return {
    ok: true,
    data: {
      name,
      cols: footprint.cols,
      rows: footprint.rows,
      position_mode: input.positionMode,
      allowed_cells: region,
    },
  };
}

function revalidateShapes(newspaperId: string) {
  revalidatePath(`/settings/newspapers/${newspaperId}/shapes`);
  revalidatePath(`/settings/newspapers/${newspaperId}`);
  revalidatePath(`/settings/newspapers/${newspaperId}/pricing`);
}

export async function createAdShapeAction(
  newspaperId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const input = readShape(formData);
  if (!input) return { message: "הטופס לא נשלח כראוי" };

  const prepared = await prepareShape(ctx.businessId, newspaperId, input);
  if (!prepared.ok) return prepared.state;

  if (await shapes.adShapeNameTaken(ctx.businessId, newspaperId, prepared.data.name)) {
    return { errors: { name: "כבר קיימת צורה בשם הזה בעיתון" } };
  }

  const created = await shapes.createAdShape(ctx.businessId, newspaperId, prepared.data);
  if (!created) return { message: "העיתון לא נמצא" };

  revalidateShapes(newspaperId);
  return {};
}

export async function updateAdShapeAction(
  newspaperId: string,
  shapeId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const input = readShape(formData);
  if (!input) return { message: "הטופס לא נשלח כראוי" };

  const prepared = await prepareShape(ctx.businessId, newspaperId, input);
  if (!prepared.ok) return prepared.state;

  if (await shapes.adShapeNameTaken(ctx.businessId, newspaperId, prepared.data.name, shapeId)) {
    return { errors: { name: "כבר קיימת צורה בשם הזה בעיתון" } };
  }

  const updated = await shapes.updateAdShape(ctx.businessId, shapeId, prepared.data);
  if (!updated) return { message: "הצורה לא נמצאה" };

  revalidateShapes(newspaperId);
  return {};
}

export async function deleteAdShapeAction(
  newspaperId: string,
  shapeId: string,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const usage = await shapes.shapeUsage(ctx.businessId, shapeId);
  const blocked = shapeDeletionBlocked(usage);
  if (blocked) return { message: blocked };

  const deleted = await shapes.deleteAdShape(ctx.businessId, shapeId);
  if (!deleted) return { message: "הצורה לא נמצאה" };

  revalidateShapes(newspaperId);
  return {};
}

/**
 * Saves only the allowed region.
 *
 * Separate from updateAdShapeAction because the region picker saves on
 * interaction rather than on submit — the same pattern as the allowed-shape
 * toggles on the page-types screen.
 */
export async function setShapeRegionAction(
  newspaperId: string,
  shapeId: string,
  mode: "anywhere" | "region",
  cells: Array<[number, number]>,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const shape = await shapes.getAdShape(ctx.businessId, shapeId);
  if (!shape) return { message: "הצורה לא נמצאה" };

  const prepared = await prepareShape(ctx.businessId, newspaperId, {
    name: shape.name,
    // Already-resolved cells, so no rounding happens on this path.
    cols: shape.cols,
    rows: shape.rows,
    positionMode: mode,
    allowedCells: cells,
  });
  if (!prepared.ok) return prepared.state;

  await shapes.updateAdShape(ctx.businessId, shapeId, prepared.data);
  revalidateShapes(newspaperId);
  return {};
}
