/**
 * Publication reads and cancellation (FR-4, FR-5, US-001).
 */
import { Prisma } from "@prisma/client";
import { basePrisma, tenantDb } from "./db";

export type PublicationFilters = {
  newspaperId?: string;
  customerId?: string;
  status?: string;
  from?: string;
  to?: string;
};

const PUBLICATION_INCLUDE = {
  customer: { select: { id: true, contact_name: true, business_name: true } },
  newspaper: { select: { id: true, name: true } },
  ad_shape: { select: { id: true, name: true, cols: true, rows: true } },
  order: { select: { id: true, number: true } },
};

export async function listPublications(businessId: string, filters: PublicationFilters = {}) {
  const where: Prisma.PublicationWhereInput = {
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
  };

  return tenantDb(businessId).publication.findMany({
    where,
    orderBy: [{ publication_date: "asc" }, { created_at: "asc" }],
    include: PUBLICATION_INCLUDE,
    take: 200,
  });
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
