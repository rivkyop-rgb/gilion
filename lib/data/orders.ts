/**
 * Order and publication data access (US-003, US-004, FR-3, FR-17).
 *
 * Everything goes through the tenant-scoped client (conventions.md §2), except
 * the approval transaction, which needs the transaction client that withAudit
 * hands it so the log and the publications share one commit.
 */
import { Prisma } from "@prisma/client";
import { basePrisma, tenantDb } from "./db";
import { roundMoney } from "@/lib/domain/order";
import { discountedPrice, orderPricing } from "@/lib/domain/ad-package";
import { packagesByNewspaper } from "./newspapers";

export type OrderFilters = { status?: string; source?: string };

const ORDER_INCLUDE = {
  customer: { select: { id: true, contact_name: true, business_name: true } },
  /// Artwork attached to the order as a whole — see AdOrder.advertisement_id.
  advertisement: { select: { id: true, name: true } },
  items: {
    orderBy: { created_at: "asc" as const },
    include: {
      // max_ad_file_size rides along so the order screen can state the
      // strictest ceiling among its own lines before a file is chosen (FR-21).
      newspaper: { select: { id: true, name: true, max_ad_file_size: true } },
      page_type: { select: { id: true, name: true } },
      ad_shape: { select: { id: true, name: true, cols: true, rows: true } },
      /// The package this line earned, so the screen can name the discount
      /// rather than merely subtract it (backlog item 12).
      ad_package: { select: { id: true, name: true } },
      /// The line's own file, when the customer sent one per line (backlog 26).
      advertisement: {
        select: { id: true, name: true, file_type: true, file_size: true, preview_url: true },
      },
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

/** Portal requests nobody has acted on yet — the number on the "מהפורטל" chip. */
export async function pendingPortalRequests(businessId: string): Promise<number> {
  return tenantDb(businessId).adOrder.count({
    where: { source: "customer_portal", status: "pending_approval" },
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
          // max_ad_file_size comes along because the order screen offers an
          // upload per publication, and each row must state the ceiling that
          // will actually be enforced on it (FR-21).
          newspaper: { select: { id: true, name: true, max_ad_file_size: true } },
          ad_shape: { select: { name: true, cols: true, rows: true } },
          // The row shows a thumbnail and opens a full preview, so it needs
          // more than a name — a name is not a file.
          advertisement: {
            select: {
              id: true,
              name: true,
              file_type: true,
              file_size: true,
              file_url: true,
              preview_url: true,
              uploaded_at: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Takes the next order number for this business.
 *
 * `increment` compiles to `UPDATE ... SET last_order_number = last_order_number
 * + 1 RETURNING`, which takes a row lock — so two people selling at the same
 * moment are serialised by Postgres and neither has to retry. Reading
 * `MAX(number) + 1` instead would let both read the same maximum.
 *
 * On `basePrisma` because `Business` carries no `business_id` of its own and is
 * outside the tenant extension (lib/data/tenant-models.ts).
 */
export async function nextOrderNumber(
  businessId: string,
  /** Inside a caller's transaction when there is one, so the row lock and the
      order it numbers commit together. */
  tx: Pick<typeof basePrisma, "business"> = basePrisma,
): Promise<number> {
  const business = await tx.business.update({
    where: { id: businessId },
    data: { last_order_number: { increment: 1 } },
    select: { last_order_number: true },
  });
  return business.last_order_number;
}

export async function createOrderDraft(businessId: string, customerId: string) {
  return tenantDb(businessId).adOrder.create({
    data: {
      customer_id: customerId,
      source: "internal",
      status: "draft",
      number: await nextOrderNumber(businessId),
    } as never,
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

/**
 * Recomputes the total from the stored lines — never from anything a client sent.
 *
 * Quantity discounts are applied HERE and not only at approval (backlog item
 * 12), because the total is what the seller quotes down the phone while the
 * order is still a draft. A discount that only appeared at approval would mean
 * quoting one number and charging another.
 */
export async function refreshTotal(businessId: string, orderId: string) {
  const items = await tenantDb(businessId).adOrderItem.findMany({
    where: { order_id: orderId },
    select: { price: true, newspaper_id: true },
  });
  const packages = await packagesByNewspaper(businessId);
  const pricing = orderPricing(
    items.map((i) => ({ newspaperId: i.newspaper_id, price: Number(i.price) })),
    packages,
  );
  await tenantDb(businessId).adOrder.update({
    where: { id: orderId },
    data: { total_price: pricing.total },
  });
  return pricing.total;
}

/**
 * What an order costs right now, with the packages it has earned.
 *
 * Reads the LIVE packages, because a draft is still being negotiated. At
 * approval the answer is frozen onto the lines (`freezeDiscounts`) and this is
 * never consulted for that order again — conventions.md §7 rule 1.
 */
export async function orderCharges(
  businessId: string,
  items: Array<{ newspaper_id: string; price: unknown }>,
) {
  const packages = await packagesByNewspaper(businessId);
  return orderPricing(
    items.map((i) => ({ newspaperId: i.newspaper_id, price: Number(i.price) })),
    packages,
  );
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
/**
 * Writes the quantity discount onto the order's lines, once, at approval.
 *
 * After this the order no longer depends on the package table at all: retiring
 * a package, changing its percentage or raising its threshold cannot alter what
 * a customer already agreed to (conventions.md §7 rule 1, the same rule that
 * freezes the price itself). Returns the lines as they now stand, so the caller
 * creates publications from the frozen numbers rather than from the ones it
 * read a moment earlier.
 */
export async function freezeDiscounts<
  T extends { id: string; newspaper_id: string; price: Prisma.Decimal | number },
>(tx: Prisma.TransactionClient, businessId: string, items: T[]) {
  const packages = await packagesByNewspaper(businessId);
  const pricing = orderPricing(
    items.map((i) => ({ newspaperId: i.newspaper_id, price: Number(i.price) })),
    packages,
  );

  for (const [index, item] of items.entries()) {
    const charge = pricing.lines[index]!;
    if (charge.discountPercent === 0 && charge.packageId === null) continue;
    await tx.adOrderItem.update({
      where: { id: item.id },
      data: { discount_percent: charge.discountPercent, package_id: charge.packageId },
    });
  }

  return {
    pricing,
    items: items.map((item, index) => ({
      ...item,
      discount_percent: pricing.lines[index]!.discountPercent,
    })),
  };
}

export async function createPublicationsForOrder(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    business_id: string;
    customer_id: string;
    source: "internal" | "customer_portal";
    /**
     * Artwork attached to the order itself, when the customer sent one file
     * for every date. Each publication is created already pointing at it, and
     * already in the state that implies — which is the whole reason the field
     * exists, since doing it afterwards means N manual links.
     */
    advertisement_id?: string | null;
  },
  items: Array<{
    id: string;
    newspaper_id: string;
    ad_shape_id: string;
    publication_date: Date;
    price: Prisma.Decimal | number;
    /** Frozen by `freezeDiscounts` in the same transaction (backlog item 12). */
    discount_percent?: Prisma.Decimal | number;
    /** The line's own file (backlog 26). Wins over the order's. */
    advertisement_id?: string | null;
  }>,
) {
  const result = await tx.publication.createMany({
    data: items.map((i) => {
      const advertisementId = i.advertisement_id ?? order.advertisement_id ?? null;
      return {
        business_id: order.business_id,
        order_id: order.id,
        order_item_id: i.id,
        customer_id: order.customer_id,
        newspaper_id: i.newspaper_id,
        ad_shape_id: i.ad_shape_id,
        publication_date: i.publication_date,
        // The NET amount. A publication is a debt, and everything that reads
        // this number has to be right about what is owed without knowing that
        // packages exist. The list price stays on the order item.
        price: discountedPrice(Number(i.price), Number(i.discount_percent ?? 0)),
        discount_percent: Number(i.discount_percent ?? 0),
        source: order.source,
        advertisement_id: advertisementId,
        // The state machine's answer for AD_LINKED on a valid, customer-owned
        // file — the ad on an order always belongs to that order's customer, so
        // there is no case where it would stop at `ad_received`.
        status: (advertisementId ? "ready_for_layout" : "planned") as
          "planned" | "ready_for_layout",
        placement_status: "not_placed" as const,
        payment_status: "unpaid" as const,
      };
    }),
    skipDuplicates: true,
  });
  return result.count;
}

/**
 * The money on the order screen: what it lists at, what a package took off, and
 * what is owed.
 *
 * A draft is priced from the LIVE packages, because it is still being
 * negotiated and the seller is quoting from this screen. Once approved the
 * numbers come off the lines themselves, where `freezeDiscounts` wrote them —
 * changing a package afterwards must not restate an order a customer already
 * agreed to (conventions.md §7 rule 1).
 */
export async function orderMoney(
  businessId: string,
  order: {
    status: string;
    items: Array<{
      newspaper_id: string;
      price: unknown;
      discount_percent?: unknown;
      newspaper: { name: string };
      ad_package?: { name: string } | null;
    }>;
  },
) {
  // Frozen only from APPROVAL, which is when `freezeDiscounts` runs — not from
  // submission. A pending order still carries 0% on its lines while its total
  // already includes the discount, and reading the lines would show a subtotal
  // that does not match the total on the same screen.
  const frozen = order.status === "approved" || order.status === "completed";

  if (!frozen) {
    const pricing = await orderCharges(businessId, order.items);
    const names = new Map(order.items.map((i) => [i.newspaper_id, i.newspaper.name]));
    return {
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      total: pricing.total,
      earned: pricing.earned.map((e) => ({
        label: e.pkg.name,
        newspaperName: names.get(e.newspaperId) ?? "",
        percent: e.pkg.discountPercent,
      })),
    };
  }

  let subtotal = 0;
  let total = 0;
  const earned = new Map<string, { label: string; newspaperName: string; percent: number }>();
  for (const item of order.items) {
    const price = Number(item.price);
    const percent = Number(item.discount_percent ?? 0);
    subtotal += price;
    total += discountedPrice(price, percent);
    if (percent > 0) {
      const key = `${item.newspaper_id}|${percent}`;
      earned.set(key, {
        label: item.ad_package?.name ?? "הנחת כמות",
        newspaperName: item.newspaper.name,
        percent,
      });
    }
  }

  return {
    subtotal: roundMoney(subtotal),
    discount: roundMoney(subtotal - total),
    total: roundMoney(total),
    earned: [...earned.values()],
  };
}
