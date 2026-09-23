/**
 * Publication reads and cancellation (FR-4, FR-5, US-001).
 */
import { Prisma } from "@prisma/client";
import { basePrisma, tenantDb } from "./db";
import { MISSING_AD_STATES, READY_TO_PLACE_STATES } from "@/lib/domain/dashboard";

export type PublicationFilters = {
  newspaperId?: string;
  customerId?: string;
  status?: string;
  from?: string;
  to?: string;
  /**
   * The dashboard's drill-down (FR-20). Each value is the same predicate the
   * KPI card counted, so the list a card opens is the list it counted — not a
   * near-enough approximation of it.
   */
  attention?: string;
};

/** How many rows a list screen shows before it says it stopped. */
export const PUBLICATION_PAGE_SIZE = 200;

/**
 * One owner of "needs artwork" / "needs placing".
 *
 * Both the counts on the dashboard and the rows behind them are built from
 * this, because a card whose number disagrees with its own list is worse than
 * a card with no link at all (lib/domain/dashboard.ts).
 */
export function attentionWhere(attention: string): Prisma.PublicationWhereInput {
  if (attention === "missing_ad") {
    return { status: { in: MISSING_AD_STATES }, advertisement_id: null };
  }
  if (attention === "not_placed") {
    return {
      status: { in: READY_TO_PLACE_STATES },
      placement_status: "not_placed",
    };
  }
  return {};
}

const PUBLICATION_INCLUDE = {
  customer: { select: { id: true, business_name: true } },
  newspaper: { select: { id: true, name: true } },
  ad_shape: { select: { id: true, name: true, cols: true, rows: true } },
  order: { select: { id: true, number: true } },
};

/** One where-builder, so the list and its count can never drift apart. */
function whereFor(filters: PublicationFilters): Prisma.PublicationWhereInput {
  return {
    ...(filters.newspaperId && filters.newspaperId !== "all"
      ? { newspaper_id: filters.newspaperId }
      : {}),
    ...(filters.customerId && filters.customerId !== "all"
      ? { customer_id: filters.customerId }
      : {}),
    ...(filters.status && filters.status !== "all"
      ? { status: filters.status as Prisma.EnumPublicationStatusFilter }
      : {}),
    ...(filters.from || filters.to
      ? {
          publication_date: {
            ...(filters.from ? { gte: new Date(filters.from) } : {}),
            ...(filters.to ? { lte: new Date(filters.to) } : {}),
          },
        }
      : {}),
    ...(filters.attention && filters.attention !== "all" ? attentionWhere(filters.attention) : {}),
  };
}

export async function listPublications(businessId: string, filters: PublicationFilters = {}) {
  return tenantDb(businessId).publication.findMany({
    where: whereFor(filters),
    orderBy: [{ publication_date: "asc" }, { created_at: "asc" }],
    include: PUBLICATION_INCLUDE,
    take: PUBLICATION_PAGE_SIZE,
  });
}

/**
 * The same list, plus how many there actually are.
 *
 * `take` without a count is a silent truncation: the screen goes on looking
 * complete while the oldest rows quietly stop existing, and a truncated list
 * that does not say it is truncated reads as a full answer. The count is what
 * lets a screen say "200 מתוך 340" instead of lying by omission.
 */
export async function listPublicationsPage(businessId: string, filters: PublicationFilters = {}) {
  const [rows, total] = await Promise.all([
    listPublications(businessId, filters),
    countPublications(businessId, filters),
  ]);
  return { rows, total, pageSize: PUBLICATION_PAGE_SIZE };
}

export async function countPublications(businessId: string, filters: PublicationFilters = {}) {
  return tenantDb(businessId).publication.count({ where: whereFor(filters) });
}

export async function getPublication(businessId: string, id: string) {
  return tenantDb(businessId).publication.findUnique({
    where: { id },
    include: PUBLICATION_INCLUDE,
  });
}

/** Statuses of every publication an order created — what gates completion. */
export async function publicationStatusesForOrder(businessId: string, orderId: string) {
  const rows = await tenantDb(businessId).publication.findMany({
    where: { order_id: orderId },
    select: { status: true },
  });
  return rows.map((r) => r.status as string);
}

export async function setPublicationStatus(
  tx: Prisma.TransactionClient,
  id: string,
  status: string,
) {
  return tx.publication.update({
    where: { id },
    data: { status: status as never },
  });
}

/** Counts used by the customer card and by the delete guard in stage 02. */
export async function publicationCountsForCustomer(businessId: string, customerId: string) {
  const [publications, orders] = await Promise.all([
    tenantDb(businessId).publication.count({ where: { customer_id: customerId } }),
    tenantDb(businessId).adOrder.count({ where: { customer_id: customerId } }),
  ]);
  return { publications, orders };
}

export { basePrisma };
