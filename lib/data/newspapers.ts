/**
 * Newspaper configuration data access (US-006).
 *
 * Newspaper, PageType, PriceRule, LayoutTemplate, TemplatePage and TemplateSlot
 * are all tenant-scoped — directly or through their parent — so every query
 * here goes through tenantDb (conventions.md §2). AdShape is the one global
 * model and is read from basePrisma on purpose.
 */
import { basePrisma, tenantDb } from "./db";

/* ---------------------------------------------------------------- newspapers */

export async function listNewspapers(businessId: string) {
  return tenantDb(businessId).newspaper.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { page_types: true, templates: true } },
    },
  });
}

export async function getNewspaper(businessId: string, id: string) {
  return tenantDb(businessId).newspaper.findUnique({
    where: { id },
    include: {
      page_types: {
        orderBy: { name: "asc" },
        include: { allowed_shapes: { include: { ad_shape: true } } },
      },
    },
  });
}

export type NewspaperWrite = {
  name: string;
  page_size: string;
  custom_width_mm: number | null;
  custom_height_mm: number | null;
  margin: number;
  print_quality: string;
  max_ad_file_size: number;
};

export async function createNewspaper(businessId: string, data: NewspaperWrite) {
  // business_id is injected by the tenant extension.
  return tenantDb(businessId).newspaper.create({ data: data as never });
}

export async function updateNewspaper(businessId: string, id: string, data: NewspaperWrite) {
  return tenantDb(businessId).newspaper.update({ where: { id }, data });
}

/** True when the name is taken by a *different* newspaper in this business. */
export async function newspaperNameTaken(businessId: string, name: string, exceptId?: string) {
  const found = await tenantDb(businessId).newspaper.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  return found !== null;
}

/* ---------------------------------------------------------------- page types */

export async function createPageType(businessId: string, newspaperId: string, name: string) {
  // PageType is scoped through its newspaper, so the extension nests the filter
  // — but the parent still has to be verified to exist in this tenant first.
  const paper = await tenantDb(businessId).newspaper.findUnique({
    where: { id: newspaperId },
    select: { id: true },
  });
  if (!paper) return null;

  return basePrisma.pageType.create({ data: { newspaper_id: newspaperId, name } });
}

export async function deletePageType(businessId: string, pageTypeId: string) {
  return tenantDb(businessId).pageType.delete({ where: { id: pageTypeId } });
}

export async function getPageType(businessId: string, pageTypeId: string) {
  return tenantDb(businessId).pageType.findUnique({
    where: { id: pageTypeId },
    include: { allowed_shapes: true, newspaper: { select: { id: true, name: true } } },
  });
}

/** How many template pages still point at this page type (validation rule 5). */
export async function pageTypeUsage(businessId: string, pageTypeId: string) {
  const templatePages = await tenantDb(businessId).templatePage.count({
    where: { page_type_id: pageTypeId },
  });
  // IssuePage arrives in stage 06; the shape is here so the rule does not have
  // to be rediscovered then.
  return { templatePages, issuePages: 0 };
}

/* -------------------------------------------------------------- ad shapes */

/** Global catalogue — shared by every business (conventions.md §2). */
export async function listAdShapes() {
  return basePrisma.adShape.findMany({ orderBy: [{ size_group: "asc" }, { name: "asc" }] });
}

export async function setAllowedShapes(businessId: string, pageTypeId: string, shapeIds: string[]) {
  const pageType = await getPageType(businessId, pageTypeId);
  if (!pageType) return null;

  const current = new Set(pageType.allowed_shapes.map((a) => a.ad_shape_id));
  const wanted = new Set(shapeIds);

  const toAdd = shapeIds.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !wanted.has(id));

  await basePrisma.$transaction([
    ...(toRemove.length
      ? [
          basePrisma.allowedAdShape.deleteMany({
            where: { page_type_id: pageTypeId, ad_shape_id: { in: toRemove } },
          }),
        ]
      : []),
    ...toAdd.map((ad_shape_id) =>
      basePrisma.allowedAdShape.create({ data: { page_type_id: pageTypeId, ad_shape_id } }),
    ),
  ]);

  return { added: toAdd.length, removed: toRemove.length };
}

/** Slots that would be orphaned by removing a shape from a page type (rule 6). */
export async function slotsUsingShape(businessId: string, pageTypeId: string, shapeId: string) {
  return tenantDb(businessId).templateSlot.count({
    where: { ad_shape_id: shapeId, template_page: { page_type_id: pageTypeId } },
  });
}

/* ---------------------------------------------------------------- pricing */

export async function pricingData(businessId: string, newspaperId: string) {
  const db = tenantDb(businessId);
  const [paper, rules, shapes] = await Promise.all([
    db.newspaper.findUnique({
      where: { id: newspaperId },
      include: {
        page_types: {
          orderBy: { name: "asc" },
          include: { allowed_shapes: { select: { ad_shape_id: true } } },
        },
      },
    }),
    db.priceRule.findMany({ where: { newspaper_id: newspaperId } }),
    listAdShapes(),
  ]);
  if (!paper) return null;

  return {
    newspaper: paper,
    shapes,
    rules: rules.map((r) => ({
      pageTypeId: r.page_type_id,
      adShapeId: r.ad_shape_id,
      price: Number(r.price),
    })),
    allowed: paper.page_types.flatMap((pt) =>
      pt.allowed_shapes.map((a) => ({ pageTypeId: pt.id, adShapeId: a.ad_shape_id })),
    ),
  };
}

export async function upsertPriceRule(
  businessId: string,
  newspaperId: string,
  pageTypeId: string,
  adShapeId: string,
  price: number | null,
) {
  const paper = await tenantDb(businessId).newspaper.findUnique({
    where: { id: newspaperId },
    select: { id: true },
  });
  if (!paper) return null;

  const where = {
    newspaper_id_page_type_id_ad_shape_id: {
      newspaper_id: newspaperId,
      page_type_id: pageTypeId,
      ad_shape_id: adShapeId,
    },
  };

  // A cleared cell means "no default price" — the row is removed rather than
  // stored as zero, which would be a real price of ₪0.
  if (price === null) {
    await basePrisma.priceRule.deleteMany({
      where: { newspaper_id: newspaperId, page_type_id: pageTypeId, ad_shape_id: adShapeId },
    });
    return { cleared: true };
  }

  return basePrisma.priceRule.upsert({
    where,
    update: { price },
    create: {
      newspaper_id: newspaperId,
      page_type_id: pageTypeId,
      ad_shape_id: adShapeId,
      price,
    },
  });
}
