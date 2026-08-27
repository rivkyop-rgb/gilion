/**
 * Order and publication data access (US-003, US-004, FR-3, FR-17).
 *
 * Everything goes through the tenant-scoped client (conventions.md §2), except
 * the approval transaction, which needs the transaction client that withAudit
 * hands it so the log and the publications share one commit.
 */
import { Prisma } from "@prisma/client";
import { basePrisma, tenantDb } from "./db";
import { orderTotal, roundMoney } from "@/lib/domain/order";

export type OrderFilters = { status?: string; source?: string };

const ORDER_INCLUDE = {
  customer: { select: { id: true, contact_name: true, business_name: true } },
  items: {
    orderBy: { created_at: "asc" as const },
    include: {
      newspaper: { select: { id: true, name: true } },
      page_type: { select: { id: true, name: true } },
      ad_shape: { select: { id: true, name: true, cols: true, rows: true } },
    },
  },
  _count: { select: { items: true, publications: true } },
};

export async function listOrders(businessId: string, filters: OrderFilters = {}) {
  return tenantDb(businessId).adOrder.findMany({
    where: {
      ...(filters.status && filters.status !== "all"
        ? { status: filters.status as Prisma.EnumOrderStatusFilter }
        : {}),
      ...(filters.source && filters.source !== "all"
        ? { source: filters.source as Prisma.EnumOrderSourceFilter }
        : {}),
    },
    orderBy: { created_at: "desc" },
    include: ORDER_INCLUDE,
  });
}

export async function countOrdersByStatus(businessId: string) {
  const rows = await tenantDb(businessId).adOrder.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Record<string, number>;
}

export async function getOrder(businessId: string, id: string) {
  return tenantDb(businessId).adOrder.findUnique({
    where: { id },
    include: {
      ...ORDER_INCLUDE,
      publications: {
        orderBy: { publication_date: "asc" },
        include: {
          newspaper: { select: { name: true } },
          ad_shape: { select: { name: true, cols: true, rows: true } },
        },
      },
    },
  });
}

export async function createOrderDraft(businessId: string, customerId: string) {
  return tenantDb(businessId).adOrder.create({
    data: { customer_id: customerId, source: "internal", status: "draft" } as never,
  });
}

export type LineWrite = {
  newspaper_id: string;
  page_type_id: string;
  ad_shape_id: string;
  publication_date: Date;
  price: number;
  /** The user knowingly picked a date the newspaper does not print on. */
  off_schedule?: boolean;
};

/** Recomputes the total from the stored lines — never from anything a client sent. */
export async function refreshTotal(businessId: string, orderId: string) {
  const items = await tenantDb(businessId).adOrderItem.findMany({
    where: { order_id: orderId },
    select: { price: true },
  });
  const total = orderTotal(items.map((i) => ({ price: Number(i.price) })));
  await tenantDb(businessId).adOrder.update({
    where: { id: orderId },
    data: { total_price: total },
  });
  return total;
}

export async function addOrderItem(businessId: string, orderId: string, line: LineWrite) {
  const created = await addOrderItems(businessId, orderId, [line]);
  return created === null ? null : (created[0] ?? null);
}

/**
 * Adds several lines in one commit.
 *
 * The multi-date picker exists because a customer buys eight publications at
 * once, and eight sequential inserts would mean eight chances to leave the
 * order half-entered with a total that matches neither what was asked for nor
 * what was billed. One transaction, one total.
 */
export async function addOrderItems(businessId: string, orderId: string, lines: LineWrite[]) {
  const order = await tenantDb(businessId).adOrder.findUnique({
    where: { id: orderId },
    select: { id: true },
  });
  if (!order) return null;
  if (lines.length === 0) return [];

  const created = await basePrisma.$transaction(
    lines.map((line) => basePrisma.adOrderItem.create({ data: { order_id: orderId, ...line } })),
  );
  await refreshTotal(businessId, orderId);
  return created;
}

export async function updateOrderItem(
  businessId: string,
  itemId: string,
  line: Partial<LineWrite>,
) {
  const item = await tenantDb(businessId).adOrderItem.findUnique({
    where: { id: itemId },
    select: { id: true, order_id: true },
  });
  if (!item) return null;

  const updated = await basePrisma.adOrderItem.update({ where: { id: itemId }, data: line });
  await refreshTotal(businessId, item.order_id);
  return updated;
}

export async function removeOrderItem(businessId: string, itemId: string) {
  const item = await tenantDb(businessId).adOrderItem.findUnique({
    where: { id: itemId },
    select: { id: true, order_id: true },
  });
  if (!item) return null;

  await basePrisma.adOrderItem.delete({ where: { id: itemId } });
  await refreshTotal(businessId, item.order_id);
  return { orderId: item.order_id };
}

/**
 * A newspaper's print schedule, or null when the id is not in this tenant.
 *
 * Separate from `orderFormOptions` because the server re-checks the schedule
 * on submit and must not have to load every newspaper's page types to do it.
 */
export async function newspaperPublicationDays(
  businessId: string,
  newspaperId: string,
): Promise<number[] | null> {
  const paper = await tenantDb(businessId).newspaper.findUnique({
    where: { id: newspaperId },
    select: { publication_days: true },
  });
  return paper ? paper.publication_days : null;
}

/** The base price for a combination, or null when the matrix cell is empty. */
export async function priceSuggestion(
  businessId: string,
  newspaperId: string,
  pageTypeId: string,
  adShapeId: string,
): Promise<number | null> {
  const rule = await tenantDb(businessId).priceRule.findFirst({
    where: { newspaper_id: newspaperId, page_type_id: pageTypeId, ad_shape_id: adShapeId },
    select: { price: true },
  });
  return rule ? Number(rule.price) : null;
}

/**
 * Everything the order builder needs to populate its selects, in one round
 * trip: newspapers, their page types, and which shapes each page type allows.
 */
export async function orderFormOptions(businessId: string) {
  const papers = await tenantDb(businessId).newspaper.findMany({
    orderBy: { name: "asc" },
    include: {
      page_types: {
        orderBy: { name: "asc" },
        include: {
          allowed_shapes: {
            include: { ad_shape: { select: { id: true, name: true, cols: true, rows: true } } },
          },
        },
      },
    },
  });

  return papers.map((p) => ({
    id: p.id,
    name: p.name,
    publicationDays: p.publication_days,
    pageTypes: p.page_types.map((pt) => ({
      id: pt.id,
      name: pt.name,
      shapes: pt.allowed_shapes.map((a) => ({
        id: a.ad_shape.id,
        name: a.ad_shape.name,
        cols: a.ad_shape.cols,
        rows: a.ad_shape.rows,
      })),
    })),
  }));
}

/**
 * Creates one Publication per order item, inside the caller's transaction.
 *
 * `price` is copied from the item and never read from PriceRule again — that
 * copy is what FR-17 is (conventions.md §7 rule 1). skipDuplicates plus the
 * unique index on order_item_id makes a double click harmless.
 */
export async function createPublicationsForOrder(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    business_id: string;
    customer_id: string;
    source: "internal" | "customer_portal";
  },
  items: Array<{
    id: string;
    newspaper_id: string;
    ad_shape_id: string;
    publication_date: Date;
    price: Prisma.Decimal | number;
  }>,
) {
  const result = await tx.publication.createMany({
    data: items.map((i) => ({
      business_id: order.business_id,
      order_id: order.id,
      order_item_id: i.id,
      customer_id: order.customer_id,
      newspaper_id: i.newspaper_id,
      ad_shape_id: i.ad_shape_id,
      publication_date: i.publication_date,
      price: roundMoney(Number(i.price)),
      source: order.source,
      status: "planned" as const,
      placement_status: "not_placed" as const,
      payment_status: "unpaid" as const,
    })),
    skipDuplicates: true,
  });
  return result.count;
}
