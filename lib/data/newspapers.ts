/**
 * Newspaper configuration data access (US-006).
 *
 * Newspaper, PageType, AdShape, AllowedAdShape and PriceRule are all
 * tenant-scoped — directly or through their parent — so every query here goes
 * through tenantDb (conventions.md §2). There is no global model left: AdShape
 * used to be one and now belongs to its newspaper, and its catalogue lives in
 * lib/data/ad-shapes.ts.
 */
import { Prisma } from "@prisma/client";

import { basePrisma, tenantDb } from "./db";
import { copyBaseShapes, listAdShapes, readAllowedCells } from "./ad-shapes";
import { BASE_PAGE_TYPES, materializeBaseShapes } from "@/lib/domain/base-shapes";
import {
  gridChanged,
  planRescale,
  type RescalePlan,
  type RescaleShape,
} from "@/lib/domain/shape-rescale";
import { deriveGrid } from "@/lib/domain/grid";
import type { PackageSpec } from "@/lib/domain/ad-package";

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
        include: {
          allowed_shapes: { include: { ad_shape: true } },
          reservations: { orderBy: { name: "asc" } },
        },
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
 * Creates a newspaper and stocks it so it can actually be sold into.
 *
 * A newspaper with no shapes cannot divide a page at all, and one with no page
 * types cannot be ordered in or composed into an issue — so neither the base
 * catalogue nor the three base page types are optional extras to add later.
 * They are part of existing.
 *
 * Every base shape is allowed on every base page type. That is deliberately
 * permissive: which shapes a cover accepts is a decision this newspaper makes,
 * and inventing a restriction here would be the system quietly having an
 * opinion about somebody else's product.
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
        base_key: s.key,
      })),
    );
  }

  await seedBasePageTypes(paper.id);

  return paper;
}

/** Cover, inner and back, each accepting every shape the newspaper has. */
async function seedBasePageTypes(newspaperId: string) {
  const shapes = await basePrisma.adShape.findMany({
    where: { newspaper_id: newspaperId },
    select: { id: true },
  });

  for (const name of BASE_PAGE_TYPES) {
    const pageType = await basePrisma.pageType.create({
      data: { newspaper_id: newspaperId, name },
    });
    if (shapes.length === 0) continue;
    await basePrisma.allowedAdShape.createMany({
      data: shapes.map((shape) => ({
        newspaper_id: newspaperId,
        page_type_id: pageType.id,
        ad_shape_id: shape.id,
      })),
      skipDuplicates: true,
    });
  }
}

/**
 * The shapes as the rescale planner wants them.
 *
 * Exported because the settings screen asks for the plan BEFORE saving — the
 * same rows have to reach the preview and the write, or the confirmation would
 * be describing a different catalogue from the one that gets changed.
 */
export async function shapesForRescale(
  businessId: string,
  newspaperId: string,
): Promise<RescaleShape[]> {
  const shapes = await tenantDb(businessId).adShape.findMany({
    where: { newspaper_id: newspaperId },
    orderBy: { name: "asc" },
  });
  return shapes.map((s) => ({
    id: s.id,
    name: s.name,
    cols: s.cols,
    rows: s.rows,
    positionMode: s.position_mode as "anywhere" | "region",
    allowedCells: readAllowedCells(s.allowed_cells),
    baseKey: s.base_key,
  }));
}

/** What saving these settings would do to the catalogue. Read-only. */
export async function previewRescale(
  businessId: string,
  id: string,
  data: NewspaperWrite,
): Promise<RescalePlan | null> {
  const current = await getNewspaper(businessId, id);
  if (!current) return null;

  const from = gridOf(current);
  const to = deriveGrid({
    pageSize: data.page_size,
    customWidthMm: data.custom_width_mm,
    customHeightMm: data.custom_height_mm,
    marginMm: data.margin,
    columns: data.columns,
    rowHeightMm: data.row_height_mm,
    gutterMm: data.gutter_mm,
  });
  if (!from || !to || !gridChanged(from, to)) return null;

  return planRescale(await shapesForRescale(businessId, id), from, to);
}

/**
 * Saves the newspaper, and keeps the base catalogue proportional to it.
 *
 * ── Why the shapes move with the page ────────────────────────────────────────
 * The catalogue is defined as ratios and resolved into cells once, when the
 * newspaper is created. Leaving it alone here is what made "חצי עמוד" stop
 * being half a page, and — worse — made a shape taller than the new page
 * unsellable everywhere with nothing on any screen admitting it. See
 * lib/domain/shape-rescale.ts for the three failures in full.
 *
 * Only shapes that still carry a `base_key` AND are still exactly where that
 * ratio puts them are touched. Anything somebody typed is theirs.
 *
 * ── What this cannot reach, and must not ─────────────────────────────────────
 * Issues that already exist. They snapshot the grid, and every placement holds
 * its own geometry (conventions.md §7 rule 2) — so an ad laid out last month
 * keeps the size it was sold at, and this changes only what can be sold from
 * now on. Prices survive too: `PriceRule` is keyed on the shape id, which does
 * not change. That is worth saying out loud on the screen, because the price
 * now buys a different amount of paper.
 */
export async function updateNewspaper(businessId: string, id: string, data: NewspaperWrite) {
  const plan = await previewRescale(businessId, id, data);

  if (!plan || plan.rescaled.length === 0) {
    return tenantDb(businessId).newspaper.update({ where: { id }, data });
  }

  // One transaction: a page that has resized while its catalogue has not is
  // exactly the state this function exists to prevent, and a half-applied
  // rescale would be that state with extra steps.
  return basePrisma.$transaction(async (tx) => {
    const paper = await tx.newspaper.update({ where: { id, business_id: businessId }, data });

    for (const change of plan.rescaled) {
      await tx.adShape.update({
        where: { id: change.id },
        data: {
          cols: change.to.cols,
          rows: change.to.rows,
          // Region shapes carry ABSOLUTE cells, so the allowed row has to move
          // with the page. Without this the bottom strip keeps pointing at a
          // row that no longer exists and silently becomes unplaceable.
          allowed_cells:
            change.allowedCells === null
              ? Prisma.DbNull
              : { cells: change.allowedCells.map(([col, row]) => [col, row]) },
        },
      });
    }

    return paper;
  });
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

/* ------------------------------------------------------- reserved areas */

/**
 * The areas of a page type that are not for sale (backlog item 14).
 *
 * Read live here because this is the SETTINGS side — what the newspaper is
 * from now on. Issues copy these when a page is created (`copyReservations` in
 * lib/data/issues.ts) and never read them again, so editing one here changes
 * every issue opened afterwards and none of the ones already laid out.
 */
export async function listReservations(businessId: string, pageTypeId: string) {
  return tenantDb(businessId).pageReservation.findMany({
    where: { page_type_id: pageTypeId },
    orderBy: { name: "asc" },
  });
}

export async function getReservation(businessId: string, id: string) {
  return tenantDb(businessId).pageReservation.findFirst({ where: { id } });
}

export type ReservationRow = {
  name: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
};

export async function createReservation(
  businessId: string,
  pageTypeId: string,
  input: ReservationRow,
) {
  const pageType = await getPageType(businessId, pageTypeId);
  if (!pageType) return null;

  return tenantDb(businessId).pageReservation.create({
    data: {
      page_type_id: pageTypeId,
      // Carried on the row itself so the composite foreign key can refuse a
      // page type from another newspaper — the same reason AllowedAdShape does.
      newspaper_id: pageType.newspaper.id,
      ...input,
    },
  });
}

export async function updateReservation(businessId: string, id: string, input: ReservationRow) {
  return tenantDb(businessId).pageReservation.update({ where: { id }, data: input });
}

/** Attaches (or clears) the image that sits in the area. An object key, never a URL. */
export async function setReservationAsset(businessId: string, id: string, key: string | null) {
  return tenantDb(businessId).pageReservation.update({
    where: { id },
    data: { asset_key: key },
  });
}

export async function deleteReservation(businessId: string, id: string) {
  return tenantDb(businessId).pageReservation.delete({ where: { id } });
}

/* ----------------------------------------------------------- ad packages */

/**
 * Quantity discounts (backlog item 12). Owned by the newspaper, like the price
 * list — see lib/domain/ad-package.ts for why they are per newspaper.
 */
export async function listPackages(businessId: string, newspaperId: string) {
  return tenantDb(businessId).adPackage.findMany({
    where: { newspaper_id: newspaperId },
    orderBy: { min_quantity: "asc" },
  });
}

/** Every newspaper's packages at once, keyed by newspaper — what pricing an order needs. */
export async function packagesByNewspaper(businessId: string) {
  const rows = await tenantDb(businessId).adPackage.findMany({ where: { active: true } });
  const map: Record<string, PackageSpec[]> = {};
  for (const row of rows) {
    (map[row.newspaper_id] ??= []).push(toPackageSpec(row));
  }
  return map;
}

export function toPackageSpec(row: {
  id: string;
  name: string;
  min_quantity: number;
  discount_percent: unknown;
  active: boolean;
}): PackageSpec {
  return {
    id: row.id,
    name: row.name,
    minQuantity: row.min_quantity,
    discountPercent: Number(row.discount_percent),
    active: row.active,
  };
}

export async function createPackage(
  businessId: string,
  newspaperId: string,
  input: { name: string; minQuantity: number; discountPercent: number },
) {
  return tenantDb(businessId).adPackage.create({
    data: {
      newspaper_id: newspaperId,
      name: input.name,
      min_quantity: input.minQuantity,
      discount_percent: input.discountPercent,
    },
  });
}

export async function setPackageActive(businessId: string, id: string, active: boolean) {
  return tenantDb(businessId).adPackage.update({ where: { id }, data: { active } });
}

/**
 * Deletes a package no approved order has earned yet.
 *
 * `package_id` on the order item is SetNull, so deleting one would leave an
 * approved order carrying a discount with nothing to name it — the frozen
 * percentage would survive and the reason for it would not. Retiring
 * (`active = false`) is the operation for a package that has been used.
 */
export async function packageInUse(businessId: string, id: string) {
  return tenantDb(businessId).adOrderItem.count({ where: { package_id: id } });
}

export async function deletePackage(businessId: string, id: string) {
  return tenantDb(businessId).adPackage.delete({ where: { id } });
}

/** Every shape of every newspaper — the "גודל" filter. Named with its paper when names repeat. */
export async function shapeOptions(businessId: string) {
  const rows = await tenantDb(businessId).adShape.findMany({
    orderBy: [{ newspaper: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, newspaper: { select: { name: true } } },
  });
  const papers = new Set(rows.map((r) => r.newspaper.name));
  return rows.map((r) => ({
    value: r.id,
    label: papers.size > 1 ? `${r.name} · ${r.newspaper.name}` : r.name,
  }));
}

/** One write for the whole choice, so no reader ever sees half of it. */
export async function setAutoPlaceSettings(
  businessId: string,
  newspaperId: string,
  autoPlaceTypeIds: string[],
  growTypeId: string | null,
) {
  const db = tenantDb(businessId);
  const types = await db.pageType.findMany({
    where: { newspaper_id: newspaperId },
    select: { id: true },
  });
  // Through the newspaper, whose tenant scope covers its page types.
  return db.newspaper.update({
    where: { id: newspaperId },
    data: {
      page_types: {
        update: types.map((t) => ({
          where: { id: t.id },
          data: { auto_place: autoPlaceTypeIds.includes(t.id), auto_grow: t.id === growTypeId },
        })),
      },
    },
  });
}
