/**
 * Layout template data access (FR-14, US-006).
 *
 * The overlap rule is enforced here, on the server, against the geometry the
 * database actually holds — the editor's live highlighting is convenience, not
 * the boundary (conventions.md §9).
 */
import { basePrisma, tenantDb } from "./db";
import { validateSlot, type Rect } from "@/lib/domain/slot-geometry";

export type SlotWrite = { adShapeId: string; x: number; y: number; width: number; height: number };

export async function listTemplates(businessId: string, newspaperId: string) {
  return tenantDb(businessId).layoutTemplate.findMany({
    where: { newspaper_id: newspaperId },
    orderBy: { name: "asc" },
    include: { _count: { select: { pages: true } } },
  });
}

export async function getTemplate(businessId: string, templateId: string) {
  return tenantDb(businessId).layoutTemplate.findUnique({
    where: { id: templateId },
    include: {
      newspaper: {
        select: {
          id: true,
          name: true,
          page_size: true,
          custom_width_mm: true,
          custom_height_mm: true,
        },
      },
      pages: {
        orderBy: { page_number: "asc" },
        include: {
          page_type: {
            select: {
              id: true,
              name: true,
              allowed_shapes: { select: { ad_shape_id: true } },
            },
          },
          slots: { include: { ad_shape: true } },
        },
      },
    },
  });
}

export async function createTemplate(businessId: string, newspaperId: string, name: string) {
  const paper = await tenantDb(businessId).newspaper.findUnique({
    where: { id: newspaperId },
    select: { id: true },
  });
  if (!paper) return null;
  return basePrisma.layoutTemplate.create({ data: { newspaper_id: newspaperId, name } });
}

/**
 * Copies a template with all its pages and slots. Used when a newspaper wants
 * a variant without rebuilding the grid by hand.
 */
export async function duplicateTemplate(businessId: string, templateId: string, name: string) {
  const source = await getTemplate(businessId, templateId);
  if (!source) return null;

  return basePrisma.$transaction(async (tx) => {
    const copy = await tx.layoutTemplate.create({
      data: { newspaper_id: source.newspaper_id, name },
    });

    for (const page of source.pages) {
      const newPage = await tx.templatePage.create({
        data: {
          layout_template_id: copy.id,
          page_type_id: page.page_type_id,
          page_number: page.page_number,
        },
      });
      for (const slot of page.slots) {
        await tx.templateSlot.create({
          data: {
            template_page_id: newPage.id,
            ad_shape_id: slot.ad_shape_id,
            position: slot.position as object,
            width: slot.width,
            height: slot.height,
          },
        });
      }
    }
    return copy;
  });
}

/** Appends a page. page_number stays 1-based and contiguous (rule 10). */
export async function addTemplatePage(businessId: string, templateId: string, pageTypeId: string) {
  const template = await tenantDb(businessId).layoutTemplate.findUnique({
    where: { id: templateId },
    include: { pages: { select: { page_number: true } } },
  });
  if (!template) return null;

  const next = template.pages.length + 1;
  return basePrisma.templatePage.create({
    data: { layout_template_id: templateId, page_type_id: pageTypeId, page_number: next },
  });
}

export async function deleteTemplatePage(businessId: string, pageId: string) {
  const page = await tenantDb(businessId).templatePage.findUnique({
    where: { id: pageId },
    select: { id: true, layout_template_id: true },
  });
  if (!page) return null;

  return basePrisma.$transaction(async (tx) => {
    await tx.templatePage.delete({ where: { id: pageId } });
    // Renumber so the sequence stays contiguous from 1 (rule 10).
    const remaining = await tx.templatePage.findMany({
      where: { layout_template_id: page.layout_template_id },
      orderBy: { page_number: "asc" },
      select: { id: true },
    });
    for (const [index, p] of remaining.entries()) {
      await tx.templatePage.update({ where: { id: p.id }, data: { page_number: index + 1 } });
    }
    return { renumbered: remaining.length };
  });
}

export type SlotResult = { ok: true; id: string } | { ok: false; message: string };

/**
 * Creates or moves a slot.
 *
 * Two rules are checked server-side, both of which the UI also shows live:
 *   - the shape must be allowed on this page's page type (rule 8)
 *   - the rectangle must not overlap a sibling (rule 9)
 */
export async function upsertTemplateSlot(
  businessId: string,
  pageId: string,
  slot: SlotWrite,
  slotId?: string,
): Promise<SlotResult> {
  const page = await tenantDb(businessId).templatePage.findUnique({
    where: { id: pageId },
    include: {
      page_type: { select: { allowed_shapes: { select: { ad_shape_id: true } } } },
      slots: { select: { id: true, position: true, width: true, height: true } },
    },
  });
  if (!page) return { ok: false, message: "עמוד התבנית לא נמצא" };

  const allowed = page.page_type.allowed_shapes.some((a) => a.ad_shape_id === slot.adShapeId);
  if (!allowed) {
    return { ok: false, message: "צורת הפרסום אינה מותרת בסוג העמוד הזה" };
  }

  const rect: Rect = { x: slot.x, y: slot.y, width: slot.width, height: slot.height };
  const siblings: Rect[] = page.slots
    .filter((s) => s.id !== slotId)
    .map((s) => {
      const pos = s.position as { x: number; y: number };
      return { x: pos.x, y: pos.y, width: Number(s.width), height: Number(s.height) };
    });

  const error = validateSlot(rect, siblings);
  if (error) return { ok: false, message: error.message };

  const data = {
    template_page_id: pageId,
    ad_shape_id: slot.adShapeId,
    position: { x: slot.x, y: slot.y },
    width: slot.width,
    height: slot.height,
  };

  const saved = slotId
    ? await basePrisma.templateSlot.update({ where: { id: slotId }, data })
    : await basePrisma.templateSlot.create({ data });

  return { ok: true, id: saved.id };
}

export async function deleteTemplateSlot(businessId: string, slotId: string) {
  const slot = await tenantDb(businessId).templateSlot.findUnique({
    where: { id: slotId },
    select: { id: true },
  });
  if (!slot) return null;
  return basePrisma.templateSlot.delete({ where: { id: slotId } });
}
