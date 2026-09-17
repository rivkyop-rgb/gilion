/**
 * Everything the customer portal reads and writes (stage 09).
 *
 * Every function takes a CustomerScope and goes through customerDb(), which
 * adds the business AND the customer to every query (lib/data/portal-db.ts).
 *
 * FR-18 is enforced HERE, not in the screens: no select in this file names
 * `price`, `total_price` or `payment_status`, so there is nothing for a page or
 * a payload to leak. portal-no-payment.spec.ts checks the wire as well.
 */
import { basePrisma } from "./db";
import { customerDb } from "./portal-db";
import { gridOf, type NewspaperRow } from "./newspapers";
import { nextOrderNumber } from "./orders";
import type { CustomerScope } from "@/lib/auth/portal-scope";
import type { PortalNewspaper, portalOrderRecord } from "@/lib/domain/portal-request";

/** The newspapers, their sellable sizes and their file limits — the form's options. */
export async function portalFormOptions(scope: CustomerScope) {
  const db = customerDb(scope);
  const papers = await db.newspaper.findMany({
    orderBy: { name: "asc" },
    include: {
      page_types: {
        orderBy: { name: "asc" },
        include: {
          allowed_shapes: {
            include: { ad_shape: { select: { id: true, name: true, cols: true, rows: true } } },
          },
          // Only whether a price EXISTS, to choose a page type with one. The
          // amount is not selected and never leaves the server.
          price_rules: { select: { ad_shape_id: true } },
        },
      },
    },
  });

  return papers.map((p) => {
    const grid = gridOf(p as unknown as NewspaperRow);
    const shapes = new Map<string, PortalNewspaper["shapes"][number]>();
    for (const pt of p.page_types) {
      const priced = new Set(pt.price_rules.map((r) => r.ad_shape_id));
      for (const allowed of pt.allowed_shapes) {
        const s = allowed.ad_shape;
        const entry = shapes.get(s.id) ?? {
          id: s.id,
          name: s.name,
          cols: s.cols,
          rows: s.rows,
          pageTypes: [],
        };
        entry.pageTypes.push({ id: pt.id, name: pt.name, priced: priced.has(s.id) });
        shapes.set(s.id, entry);
      }
    }

    return {
      id: p.id,
      name: p.name,
      publicationDays: p.publication_days,
      maxAdFileSize: p.max_ad_file_size,
      grid: grid ? { columns: grid.columns, rows: grid.rows } : null,
      // Largest first — "a full page" before "a quarter" is how a price list
      // reads, and it keeps the proportions from jumping around.
      shapes: [...shapes.values()].sort((a, b) => b.cols * b.rows - a.cols * a.rows),
    };
  });
}

export type PortalFormNewspaper = Awaited<ReturnType<typeof portalFormOptions>>[number];

/** The shape a request is listed and shown in. Note what is absent. */
const REQUEST_SELECT = {
  id: true,
  number: true,
  status: true,
  rejection_reason: true,
  created_at: true,
  updated_at: true,
  approved_at: true,
  completed_at: true,
  advertisement: {
    select: { id: true, name: true, file_type: true, file_size: true, preview_url: true },
  },
  items: {
    take: 1,
    select: {
      publication_date: true,
      newspaper: { select: { id: true, name: true } },
      ad_shape: { select: { id: true, name: true, cols: true, rows: true } },
    },
  },
} as const;

/**
 * The customer's requests — the ones they sent from the portal.
 *
 * An order a salesperson typed in for them is not a request they made, and a
 * draft someone is still pricing is not something to show a customer at all.
 */
export async function portalRequests(scope: CustomerScope) {
  return customerDb(scope).adOrder.findMany({
    where: { source: "customer_portal" },
    orderBy: { created_at: "desc" },
    select: REQUEST_SELECT,
  });
}

/** One request, or null — including when it belongs to somebody else (404). */
export async function portalRequest(scope: CustomerScope, id: string) {
  return customerDb(scope).adOrder.findFirst({
    where: { id, source: "customer_portal" },
    select: REQUEST_SELECT,
  });
}

/** The uploaded file as the server knows it, for rule 4. */
export async function portalAdvertisement(scope: CustomerScope, id: string) {
  if (!id) return null;
  return customerDb(scope).advertisement.findFirst({
    where: { id },
    select: {
      id: true,
      customer_id: true,
      file_type: true,
      file_size: true,
      validation_status: true,
      status: true,
    },
  });
}

/** The single base price for the combination, when one is set. Never returned to a screen. */
export async function portalListPrice(
  scope: CustomerScope,
  newspaperId: string,
  pageTypeId: string,
  adShapeId: string,
): Promise<number | null> {
  const rule = await customerDb(scope).priceRule.findFirst({
    where: { newspaper_id: newspaperId, page_type_id: pageTypeId, ad_shape_id: adShapeId },
    select: { price: true },
  });
  return rule ? Number(rule.price) : null;
}

/**
 * The request, in one transaction: the number, the order, its one line.
 *
 * Written through basePrisma inside the transaction, with business and customer
 * named explicitly — the same way createPublicationsForOrder writes — because
 * the order number's row lock and the order it numbers have to commit together
 * (nextOrderNumber). The record itself comes from portalOrderRecord(), which is
 * the only thing that decides status and source.
 */
export async function createPortalRequest(
  scope: CustomerScope,
  record: ReturnType<typeof portalOrderRecord>,
) {
  return basePrisma.$transaction(async (tx) => {
    const number = await nextOrderNumber(scope.businessId, tx);
    const order = await tx.adOrder.create({
      data: {
        ...record.order,
        // The scope, not the record, says whose request this is.
        customer_id: scope.customerId,
        business_id: scope.businessId,
        number,
      },
      select: { id: true },
    });
    await tx.adOrderItem.create({
      data: {
        ...record.item,
        order_id: order.id,
        publication_date: new Date(`${record.item.publication_date}T00:00:00Z`),
      },
    });
    return order;
  });
}

/**
 * Rule 8: a customer withdraws only what nobody has acted on yet.
 *
 * The status is part of the WHERE, so a request approved a second before the
 * customer clicked is not cancelled out from under the approval — the update
 * matches nothing, and the caller says so.
 */
export async function cancelPortalRequest(scope: CustomerScope, id: string): Promise<boolean> {
  const result = await customerDb(scope).adOrder.updateMany({
    where: { id, source: "customer_portal", status: "pending_approval" },
    data: { status: "canceled" },
  });
  return result.count === 1;
}

// --- Upload -------------------------------------------------------------------

export async function portalNewspaperLimit(scope: CustomerScope, newspaperId: string) {
  return customerDb(scope).newspaper.findFirst({
    where: { id: newspaperId },
    select: { id: true, name: true, max_ad_file_size: true },
  });
}

export async function createPortalAdvertisement(
  scope: CustomerScope,
  ad: { name: string; fileType: string; fileSize: number },
) {
  return customerDb(scope).advertisement.create({
    data: {
      uploaded_by_user_id: scope.userId,
      name: ad.name,
      file_type: ad.fileType,
      file_size: ad.fileSize,
      file_url: "",
      original_file_url: "",
      validation_status: "pending",
    } as never,
    select: { id: true },
  });
}

export async function finishPortalAdvertisement(
  scope: CustomerScope,
  id: string,
  keys: { fileUrl: string; previewUrl: string | null },
) {
  return customerDb(scope).advertisement.update({
    where: { id },
    data: {
      file_url: keys.fileUrl,
      original_file_url: keys.fileUrl,
      preview_url: keys.previewUrl,
      status: "valid",
      validation_status: "passed",
      validation_error: null,
    },
    select: { id: true, name: true, file_type: true, file_size: true, preview_url: true },
  });
}

export async function deletePortalAdvertisement(scope: CustomerScope, id: string) {
  await customerDb(scope).advertisement.deleteMany({ where: { id } });
}

// --- Chrome -------------------------------------------------------------------

/** The name on the portal's top bar: the business, as its admin panel names it. */
export async function portalGreeting(scope: CustomerScope) {
  const [customer, user] = await Promise.all([
    customerDb(scope).customer.findFirst({
      select: { contact_name: true, business_name: true },
    }),
    basePrisma.user.findUnique({ where: { id: scope.userId }, select: { name: true } }),
  ]);
  return { userName: user?.name ?? customer?.contact_name ?? "", customer };
}
