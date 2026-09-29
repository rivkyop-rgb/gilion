/**
 * Advertisement data access (US-005). Everything goes through the
 * tenant-scoped client, so another business's file is not reachable even by
 * id (conventions.md §2).
 */
import { clampPage, skipFor, type ListParams } from "@/lib/domain/list-view";
import { Prisma } from "@prisma/client";
import { basePrisma, tenantDb } from "./db";

export type AdFilters = {
  customerId?: string;
  status?: string;
  fileType?: string;
  from?: string;
  to?: string;
  /** The "ללא לקוח" quick chip (US-005 AC-4). */
  unassigned?: boolean;
  /** Files used by a publication in this newspaper — "which files went to X". */
  newspaperId?: string;
};

const AD_INCLUDE = {
  customer: { select: { id: true, business_name: true } },
  uploaded_by: { select: { id: true, name: true } },
  _count: { select: { publications: true } },
};

function adWhere(filters: AdFilters, search = ""): Prisma.AdvertisementWhereInput {
  const q = search.trim();
  return {
    ...(filters.unassigned
      ? { customer_id: null }
      : filters.customerId && filters.customerId !== "all"
        ? { customer_id: filters.customerId }
        : {}),
    ...(filters.status && filters.status !== "all"
      ? { status: filters.status as Prisma.EnumAdStatusFilter }
      : {}),
    ...(filters.fileType && filters.fileType !== "all"
      ? { file_type: filters.fileType as Prisma.EnumAdFileTypeFilter }
      : {}),
    ...(filters.newspaperId && filters.newspaperId !== "all"
      ? { publications: { some: { newspaper_id: filters.newspaperId } } }
      : {}),
    ...(filters.from || filters.to
      ? {
          uploaded_at: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            // An inclusive "to": a date alone is midnight, which would drop
            // everything uploaded on the day the user asked for.
            ...(filters.to ? { lt: dayAfter(filters.to) } : {}),
          },
        }
      : {}),
    // A file is found by what it is called or whose it is.
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { customer: { business_name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
}

export async function listAdvertisements(businessId: string, filters: AdFilters = {}) {
  return tenantDb(businessId).advertisement.findMany({
    where: adWhere(filters),
    orderBy: [{ uploaded_at: "desc" }],
    include: AD_INCLUDE,
    take: 200,
  });
}

/** One page, and the whole count — the pager needs both. */
export async function listAdvertisementsPage(
  businessId: string,
  filters: AdFilters,
  list: ListParams,
) {
  const db = tenantDb(businessId);
  const where = adWhere(filters, list.q);
  const total = await db.advertisement.count({ where });
  const page = clampPage(list, total);
  const rows = await db.advertisement.findMany({
    where,
    orderBy: [{ uploaded_at: "desc" }],
    include: AD_INCLUDE,
    skip: skipFor(page),
    take: page.size,
  });
  return { rows, total, list: page };
}

function dayAfter(iso: string): Date {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return d;
}

export async function getAdvertisement(businessId: string, id: string) {
  return tenantDb(businessId).advertisement.findUnique({
    where: { id },
    include: {
      ...AD_INCLUDE,
      publications: {
        select: {
          id: true,
          publication_date: true,
          status: true,
          newspaper: { select: { name: true } },
          customer: { select: { business_name: true } },
        },
        orderBy: { publication_date: "asc" },
      },
    },
  });
}

/**
 * The row is created BEFORE the bytes reach MinIO, with empty keys and
 * `validation_status: pending`.
 *
 * That order is what lets the id in the object key be the same cuid Prisma
 * generates, instead of an id invented in the app layer — and `pending` is a
 * state the design already draws ("בבדיקה…"), so an action that dies halfway
 * leaves something honest on screen rather than a row pretending to be valid.
 */
export async function createPendingAdvertisement(
  businessId: string,
  ad: {
    customerId: string | null;
    uploadedByUserId: string;
    name: string;
    fileType: string;
    fileSize: number;
  },
) {
  return tenantDb(businessId).advertisement.create({
    // `as never`, like every other create in this layer: the extension injects
    // business_id at runtime, so the compiler is looking at an input shape the
    // caller is deliberately not allowed to supply (conventions.md §2).
    data: {
      customer_id: ad.customerId,
      uploaded_by_user_id: ad.uploadedByUserId,
      name: ad.name,
      file_type: ad.fileType,
      file_size: ad.fileSize,
      file_url: "",
      original_file_url: "",
      validation_status: "pending",
    } as never,
  });
}

/** Closes an upload: either the keys and `passed`, or the Hebrew reason and
 * `failed` (US-005 AC-2). */
export async function finishAdvertisement(
  businessId: string,
  id: string,
  outcome:
    | { ok: true; fileUrl: string; originalFileUrl: string; previewUrl: string | null }
    | { ok: false; fileUrl: string; originalFileUrl: string; message: string },
) {
  return tenantDb(businessId).advertisement.update({
    where: { id },
    data: outcome.ok
      ? {
          file_url: outcome.fileUrl,
          original_file_url: outcome.originalFileUrl,
          preview_url: outcome.previewUrl,
          status: "valid",
          validation_status: "passed",
          validation_error: null,
        }
      : {
          file_url: outcome.fileUrl,
          original_file_url: outcome.originalFileUrl,
          status: "invalid",
          validation_status: "failed",
          validation_error: outcome.message,
        },
  });
}

export async function deleteAdvertisement(businessId: string, id: string) {
  return tenantDb(businessId).advertisement.delete({ where: { id } });
}

export async function setAdCustomer(businessId: string, id: string, customerId: string | null) {
  return tenantDb(businessId).advertisement.update({
    where: { id },
    data: { customer_id: customerId },
  });
}

export async function setAdFileKeys(
  businessId: string,
  id: string,
  keys: {
    fileUrl: string;
    previousFileUrl: string | null;
    previewUrl?: string | null;
    fileType?: string;
    fileSize?: number;
    name?: string;
  },
) {
  return tenantDb(businessId).advertisement.update({
    where: { id },
    data: {
      file_url: keys.fileUrl,
      previous_file_url: keys.previousFileUrl,
      ...(keys.previewUrl !== undefined ? { preview_url: keys.previewUrl } : {}),
      ...(keys.fileType
        ? { file_type: keys.fileType as Prisma.AdvertisementUpdateInput["file_type"] }
        : {}),
      ...(keys.fileSize !== undefined ? { file_size: keys.fileSize } : {}),
      ...(keys.name ? { name: keys.name } : {}),
      status: "valid",
      validation_status: "passed",
      validation_error: null,
    },
  });
}

export async function archiveAdvertisement(businessId: string, id: string) {
  return tenantDb(businessId).advertisement.update({
    where: { id },
    data: { status: "archived" },
  });
}

/** Every publication this ad is currently attached to — one ad, many uses. */
export async function publicationsUsingAd(businessId: string, adId: string) {
  return tenantDb(businessId).publication.findMany({
    where: { advertisement_id: adId },
    select: { id: true, status: true, publication_date: true },
  });
}

/**
 * The publications an ad may be linked to: same customer, and still waiting
 * for material (rules 5 and 10).
 */
export async function linkablePublications(businessId: string, customerId: string) {
  return tenantDb(businessId).publication.findMany({
    where: { customer_id: customerId, status: { in: ["missing_ad"] } },
    orderBy: { publication_date: "asc" },
    select: {
      id: true,
      publication_date: true,
      status: true,
      newspaper: { select: { name: true } },
      ad_shape: { select: { name: true } },
    },
    take: 100,
  });
}

/**
 * Every ad that is actually placeable, as the picker on the publications list
 * needs them (US-005 AC-2 and AC-4 in one query).
 *
 * Fetched once for the whole table rather than per row: a query per
 * publication would be a hundred round trips to render one screen, and the
 * rows only ever need three columns.
 */
export async function placeableAds(businessId: string) {
  return tenantDb(businessId).advertisement.findMany({
    where: {
      status: "valid",
      validation_status: "passed",
      customer_id: { not: null },
    },
    orderBy: { uploaded_at: "desc" },
    // Everything the picker needs to tell two similarly-named files apart, in
    // ONE query for the whole table — a lookup per row would turn a table of
    // forty publications into forty requests.
    select: {
      id: true,
      name: true,
      customer_id: true,
      file_type: true,
      file_size: true,
      file_url: true,
      preview_url: true,
      uploaded_at: true,
      uploaded_by: { select: { name: true } },
      customer: { select: { business_name: true } },
      _count: { select: { publications: true } },
    },
  });
}

export async function getPublicationForLink(businessId: string, publicationId: string) {
  return tenantDb(businessId).publication.findUnique({
    where: { id: publicationId },
    select: { id: true, customer_id: true, status: true, advertisement_id: true },
  });
}

/**
 * A publication as an UPLOAD TARGET.
 *
 * Uploading into a publication answers both questions the standalone upload
 * form has to ask: the customer is the publication's customer, and the size
 * limit is its newspaper's (FR-21). Neither is a choice at that point, so
 * neither is offered — an upload started from here cannot land on the wrong
 * customer or be measured against the wrong newspaper.
 */
export async function getPublicationUploadTarget(businessId: string, publicationId: string) {
  const row = await tenantDb(businessId).publication.findUnique({
    where: { id: publicationId },
    select: {
      id: true,
      customer_id: true,
      status: true,
      advertisement_id: true,
      newspaper: { select: { id: true, name: true, max_ad_file_size: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status,
    advertisementId: row.advertisement_id,
    newspaper: {
      id: row.newspaper.id,
      name: row.newspaper.name,
      maxAdFileSize: row.newspaper.max_ad_file_size,
    },
  };
}

/**
 * Attaching and detaching, as ONE write each.
 *
 * `status` is passed in already computed by lib/domain/publication-status.ts —
 * this layer never decides a state, it only records the one the machine
 * produced (conventions.md §3).
 */
export async function attachAdToPublication(
  businessId: string,
  publicationId: string,
  adId: string,
  status: string,
) {
  return tenantDb(businessId).publication.update({
    where: { id: publicationId },
    data: { advertisement_id: adId, status: status as never },
  });
}

export async function detachAdFromPublication(
  businessId: string,
  publicationId: string,
  status: string,
) {
  return tenantDb(businessId).publication.update({
    where: { id: publicationId },
    data: { advertisement_id: null, status: status as never },
  });
}

/**
 * An order as an UPLOAD TARGET, for artwork that arrived with the order.
 *
 * The order fixes the customer. It does NOT fix one newspaper — a single order
 * may run in several — so the ceiling is the strictest among the newspapers it
 * actually uses (FR-21). Accepting anything looser would take a file that one
 * of the order's own lines could never print.
 */
export async function getOrderUploadTarget(businessId: string, orderId: string) {
  const row = await tenantDb(businessId).adOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      customer_id: true,
      status: true,
      advertisement_id: true,
      items: {
        select: { newspaper: { select: { name: true, max_ad_file_size: true } } },
      },
    },
  });
  if (!row) return null;

  const papers = row.items.map((i) => i.newspaper);
  const strictest =
    papers.length > 0
      ? papers.reduce((a, b) => (b.max_ad_file_size < a.max_ad_file_size ? b : a))
      : null;

  return {
    id: row.id,
    customerId: row.customer_id,
    status: row.status as string,
    advertisementId: row.advertisement_id,
    /**
     * Before approval the file waits on the ORDER; after approval it goes
     * straight to the publications that are still without one. Either way the
     * order is a legitimate place to drop a file — only a finished or
     * abandoned order is not.
     */
    editable: !["completed", "canceled", "rejected"].includes(row.status),
    /** True while the file should be parked on the order rather than linked. */
    beforeApproval: row.status === "draft" || row.status === "pending_approval",
    limit: strictest
      ? { maxBytes: strictest.max_ad_file_size, newspaperName: strictest.name }
      : null,
  };
}

export async function setOrderAdvertisement(
  businessId: string,
  orderId: string,
  adId: string | null,
) {
  return tenantDb(businessId).adOrder.update({
    where: { id: orderId },
    data: { advertisement_id: adId },
  });
}

/** The publications of one order that are still waiting for artwork. */
export async function publicationsAwaitingArtwork(businessId: string, orderId: string) {
  return tenantDb(businessId).publication.findMany({
    where: {
      order_id: orderId,
      advertisement_id: null,
      status: { in: ["missing_ad"] },
    },
    select: { id: true, status: true },
  });
}

/**
 * Every publication of this ad's customer that could still take it.
 *
 * Powers "attach to all open publications", which is the answer to the most
 * common real request: one file, several dates. Doing it one row at a time is
 * the same act repeated, and repetition is where a row gets missed.
 */
export async function openPublicationsForAd(businessId: string, customerId: string) {
  return tenantDb(businessId).publication.findMany({
    where: {
      customer_id: customerId,
      status: { in: ["missing_ad"] },
      advertisement_id: null,
    },
    select: { id: true, status: true },
  });
}

/**
 * Whether an issue currently locks this ad (rules 11 and 12).
 *
 * Placement and Issue arrive in stage 06; until then nothing can lock an ad,
 * and this returns null rather than pretending to check. The call sites are
 * already wired so that stage 06 fills in one function instead of hunting for
 * the places that should have asked.
 */
export async function issueLockOn(_businessId: string, _adId: string): Promise<string | null> {
  return null;
}

/** The per-newspaper upload ceilings the requirements card renders (FR-21). */
export async function newspaperLimits(businessId: string) {
  const rows = await tenantDb(businessId).newspaper.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, max_ad_file_size: true },
  });
  return rows.map((n) => ({ id: n.id, name: n.name, maxAdFileSize: n.max_ad_file_size }));
}

export async function newspaperLimit(businessId: string, newspaperId: string) {
  const row = await tenantDb(businessId).newspaper.findUnique({
    where: { id: newspaperId },
    select: { id: true, name: true, max_ad_file_size: true },
  });
  return row ? { id: row.id, name: row.name, maxAdFileSize: row.max_ad_file_size } : null;
}

export { basePrisma };
