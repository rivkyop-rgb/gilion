"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getTenantContext } from "@/lib/auth/tenant";
import { requireAccess } from "@/lib/auth/rbac";
import {
  allowedShapeRemovalBlocked,
  pageTypeDeletionBlocked,
  toBytes,
  validateNewspaper,
} from "@/lib/domain/newspaper";
import { validatePrice } from "@/lib/domain/pricing";
import * as papers from "@/lib/data/newspapers";
import * as templates from "@/lib/data/templates";

export type FormState = { errors?: Record<string, string>; message?: string };

/** Newspaper configuration is admin-only (FR-8, stage 03 permission table). */
async function requireAdmin() {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "settings", "write");
  return ctx;
}

const newspaperSchema = z.object({
  name: z.string(),
  pageSize: z.string(),
  customWidthMm: z.coerce.number().optional().nullable(),
  customHeightMm: z.coerce.number().optional().nullable(),
  margin: z.coerce.number(),
  printQuality: z.string(),
  maxAdFileSizeMb: z.coerce.number(),
});

function readNewspaper(formData: FormData) {
  const parsed = newspaperSchema.safeParse({
    name: formData.get("name"),
    pageSize: formData.get("pageSize"),
    customWidthMm: formData.get("customWidthMm") || null,
    customHeightMm: formData.get("customHeightMm") || null,
    margin: formData.get("margin"),
    printQuality: formData.get("printQuality"),
    maxAdFileSizeMb: formData.get("maxAdFileSizeMb"),
  });
  return parsed.success ? parsed.data : null;
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

  // Rule 5: a page type still referenced by a template page cannot go.
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

  // Rule 6: removing a shape that template slots still use would orphan them.
  const removing = pageType.allowed_shapes
    .map((a) => a.ad_shape_id)
    .filter((id) => !shapeIds.includes(id));

  for (const shapeId of removing) {
    const used = await papers.slotsUsingShape(ctx.businessId, pageTypeId, shapeId);
    const shape = (await papers.listAdShapes()).find((s) => s.id === shapeId);
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

/* ------------------------------------------------------------- templates */

export async function createTemplateAction(
  newspaperId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { errors: { name: "שם התבנית הוא שדה חובה" } };

  const created = await templates.createTemplate(ctx.businessId, newspaperId, name);
  if (!created) return { message: "העיתון לא נמצא" };

  revalidatePath(`/settings/newspapers/${newspaperId}/templates`);
  redirect(`/settings/newspapers/${newspaperId}/templates/${created.id}`);
}

export async function addTemplatePageAction(
  newspaperId: string,
  templateId: string,
  pageTypeId: string,
): Promise<FormState> {
  const ctx = await requireAdmin();
  const created = await templates.addTemplatePage(ctx.businessId, templateId, pageTypeId);
  if (!created) return { message: "התבנית לא נמצאה" };

  revalidatePath(`/settings/newspapers/${newspaperId}/templates/${templateId}`);
  return {};
}

export async function deleteTemplatePageAction(
  newspaperId: string,
  templateId: string,
  pageId: string,
): Promise<FormState> {
  const ctx = await requireAdmin();
  await templates.deleteTemplatePage(ctx.businessId, pageId);
  revalidatePath(`/settings/newspapers/${newspaperId}/templates/${templateId}`);
  return {};
}

export async function upsertSlotAction(
  newspaperId: string,
  templateId: string,
  pageId: string,
  slot: { adShapeId: string; x: number; y: number; width: number; height: number },
  slotId?: string,
): Promise<FormState> {
  const ctx = await requireAdmin();

  const result = await templates.upsertTemplateSlot(ctx.businessId, pageId, slot, slotId);
  if (!result.ok) return { message: result.message };

  revalidatePath(`/settings/newspapers/${newspaperId}/templates/${templateId}`);
  return {};
}

export async function deleteSlotAction(
  newspaperId: string,
  templateId: string,
  slotId: string,
): Promise<FormState> {
  const ctx = await requireAdmin();
  await templates.deleteTemplateSlot(ctx.businessId, slotId);
  revalidatePath(`/settings/newspapers/${newspaperId}/templates/${templateId}`);
  return {};
}
