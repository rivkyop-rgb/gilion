/**
 * Newspaper configuration data access (US-006).
 *
 * Newspaper, PageType, AdShape, AllowedAdShape and PriceRule are all
 * tenant-scoped — directly or through their parent — so every query here goes
 * through tenantDb (conventions.md §2). There is no global model left: AdShape
 * used to be one and now belongs to its newspaper, and its catalogue lives in
 * lib/data/ad-shapes.ts.
 */
import { basePrisma, tenantDb } from "./db";
import { copyBaseShapes, listAdShapes } from "./ad-shapes";
import { materializeBaseShapes } from "@/lib/domain/base-shapes";
import { deriveGrid } from "@/lib/domain/grid";

/* ---------------------------------------------------------------- newspapers */

export async function listNewspapers(businessId: string) {
  return tenantDb(businessId).newspaper.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { page_types: true, ad_shapes: true } },
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

/** A newspaper's stored settings, resolved into a usable grid. */
export type NewspaperRow = {
  page_size: string;
  custom_width_mm: unknown;
  custom_height_mm: unknown;
  margin: unknown;
  columns: number;
  row_height_mm: unknown;
  gutter_mm: unknown;
};

/**
 * The grid a newspaper's shapes and placements are measured in.
 *
 * Prisma hands Decimals back as objects, so the conversion to plain numbers
 * happens here rather than being repeated at every call site.
 */
export function gridOf(paper: NewspaperRow) {
  return deriveGrid({
    pageSize: paper.page_size,
    customWidthMm: paper.custom_width_mm === null ? null : Number(paper.custom_width_mm),
    customHeightMm: paper.custom_height_mm === null ? null : Number(paper.custom_height_mm),
    marginMm: Number(paper.margin),
    columns: paper.columns,
    rowHeightMm: Number(paper.row_height_mm),
    gutterMm: Number(paper.gutter_mm),
  });
}

/** The newspaper plus its resolved grid — what every shape screen needs. */
export async function newspaperGrid(businessId: string, newspaperId: string) {
  const paper = await tenantDb(businessId).newspaper.findUnique({ where: { id: newspaperId } });
  if (!paper) return null;
  const grid = gridOf(paper);
  return grid ? { paper, grid } : null;
}

export type NewspaperWrite = {
  name: string;
  page_size: string;
  custom_width_mm: number | null;
  custom_height_mm: number | null;
  margin: number;
  print_quality: string;
  max_ad_file_size: number;
  columns: number;
  row_height_mm: number;
  gutter_mm: number;
  /** Weekday numbers 0..6; empty means no schedule declared. */
  publication_days: number[];
};

/**
 * Creates a newspaper and stocks its shape catalogue in one transaction.
 *
 * A newspaper with no shapes cannot divide a page at all, so the base
 * catalogue is not an optional extra to add later — it is part of existing.
 */
export async function createNewspaper(businessId: string, data: NewspaperWrite) {
  // business_id is injected by the tenant extension.
  const paper = await tenantDb(businessId).newspaper.create({ data: data as never });

  const grid = deriveGrid({
    pageSize: data.page_size,
    customWidthMm: data.custom_width_mm,
    customHeightMm: data.custom_height_mm,
    marginMm: data.margin,
    columns: data.columns,
    rowHeightMm: data.row_height_mm,
    gutterMm: data.gutter_mm,
  });
  if (grid) {
    await copyBaseShapes(
      paper.id,
      materializeBaseShapes(grid).map((s) => ({
        name: s.name,
        cols: s.cols,
        rows: s.rows,
        position_mode: s.positionMode,
        allowed_cells: s.allowedCells,
      })),
    );
  }

  return paper;
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

/** Rule 5: the name is unique inside the newspaper. */
export async function pageTypeNameTaken(
  businessId: string,
  newspaperId: string,
  name: string,
  exceptId?: string,
) {
  const found = await tenantDb(businessId).pageType.findFirst({
    where: {
      newspaper_id: newspaperId,
      name,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  return found !== null;
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

/** What still points at this page type (validation rule 5). */
export async function pageTypeUsage(_businessId: string, _pageTypeId: string) {
  // Price rules and allowed-shape rows cascade, so they never block. IssuePage
  // arrives in stage 06; the shape is here so the rule does not have to be
  // rediscovered then.
  return { issuePages: 0 };
}

/* -------------------------------------------------------------- ad shapes */

export async function setAllowedShapes(businessId: string, pageTypeId: string, shapeIds: string[]) {
  const pageType = await getPageType(businessId, pageTypeId);
  if (!pageType) return null;

  const current = new Set(pageType.allowed_shapes.map((a) => a.ad_shape_id));
  const wanted = new Set(shapeIds);

  const toAdd = shapeIds.filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !wanted.has(id));

  // newspaper_id is carried on the join row itself so the composite foreign
  // keys can refuse a page type and a shape from different newspapers.
  const newspaperId = pageType.newspaper.id;

  await basePrisma.$transaction([
    ...(toRemove.length
      ? [
          basePrisma.allowedAdShape.deleteMany({
            where: { page_type_id: pageTypeId, ad_shape_id: { in: toRemove } },
          }),
        ]
      : []),
    ...toAdd.map((ad_shape_id) =>
      basePrisma.allowedAdShape.create({
        data: { newspaper_id: newspaperId, page_type_id: pageTypeId, ad_shape_id },
      }),
    ),
  ]);

  return { added: toAdd.length, removed: toRemove.length };
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
    listAdShapes(businessId, newspaperId),
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
