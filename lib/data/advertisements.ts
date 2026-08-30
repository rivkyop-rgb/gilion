/**
 * Advertisement data access (US-005). Everything goes through the
 * tenant-scoped client, so another business's file is not reachable even by
 * id (conventions.md §2).
 */
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
};

const AD_INCLUDE = {
  customer: { select: { id: true, contact_name: true, business_name: true } },
  uploaded_by: { select: { id: true, name: true } },
  _count: { select: { publications: true } },
};

export async function listAdvertisements(businessId: string, filters: AdFilters = {}) {
  const where: Prisma.AdvertisementWhereInput = {
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
  };

  return tenantDb(businessId).advertisement.findMany({
    where,
    orderBy: [{ uploaded_at: "desc" }],
    include: AD_INCLUDE,
    take: 200,
  });
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
          customer: { select: { contact_name: true, business_name: true } },
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
    where: { customer_id: customerId, status: { in: ["planned", "missing_ad"] } },
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
    select: { id: true, name: true, customer_id: true, file_type: true },
  });
}

export async function getPublicationForLink(businessId: string, publicationId: string) {
  return tenantDb(businessId).publication.findUnique({
    where: { id: publicationId },
    select: { id: true, customer_id: true, status: true, advertisement_id: true },
  });
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
