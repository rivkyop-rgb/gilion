/**
 * Everything the customer portal reads and writes (stage 09).
 *
 * Every function takes a CustomerScope and goes through customerDb(), which
 * adds the business AND the customer to every query (lib/data/portal-db.ts).
 *
 * FR-18 was enforced here until 17/09/2026 — no select named a price. It was
 * reversed at the user's request (backlog 23): a customer sees their own
 * prices, estimates and payments. What still holds is WHOSE: every row here is
 * the scope's customer's, and portal-charges.spec.ts checks the wire for
 * another customer's amounts.
 */
import { withAudit } from "./audit";
import { basePrisma } from "./db";
import { customerDb } from "./portal-db";
import { gridOf, type NewspaperRow } from "./newspapers";
import { packagesByNewspaper } from "./newspapers";
import { nextOrderNumber } from "./orders";
import { customerAccount, customerCredit, paymentsForCustomer } from "./payments";
import { orderPricing } from "@/lib/domain/ad-package";
import { pickPageType } from "@/lib/domain/portal-request";
import type { CustomerScope } from "@/lib/auth/portal-scope";
import type { PortalNewspaper, portalOrderRecord } from "@/lib/domain/portal-request";

/** The newspapers, their sellable sizes and their file limits — the form's options. */
export async function portalFormOptions(scope: CustomerScope) {
  const db = customerDb(scope);
  // The business's quantity packages — catalogue, like the price list. A
  // one-date request earns one only when a package starts at a single
  // publication, but the estimate must be the number approval would charge.
  const packages = await packagesByNewspaper(scope.businessId);
  const papers = await db.newspaper.findMany({
    orderBy: { name: "asc" },
    include: {
      page_types: {
        orderBy: { name: "asc" },
        include: {
          allowed_shapes: {
            include: { ad_shape: { select: { id: true, name: true, cols: true, rows: true } } },
          },
          price_rules: { select: { ad_shape_id: true, price: true } },
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

    // The estimate per size (backlog 23): the list price of the page type the
    // request would be filed under, less any package it earns. Computed with
    // the same pickPageType and orderPricing that submit and approval use, so
    // the number on the form is the number on the order.
    const priceOf = new Map<string, number>();
    for (const pt of p.page_types) {
      for (const rule of pt.price_rules)
        priceOf.set(`${pt.id}:${rule.ad_shape_id}`, Number(rule.price));
    }
    const estimated = [...shapes.values()].map((shape) => {
      const pageTypeId = pickPageType(shape);
      const list = pageTypeId ? priceOf.get(`${pageTypeId}:${shape.id}`) : undefined;
      return {
        ...shape,
        /** The list price of one insertion, before any package. */
        listPrice: list ?? null,
        /** One insertion on its own, packages applied. */
        estimate:
          list === undefined
            ? null
            : orderPricing([{ newspaperId: p.id, price: list }], packages).total,
      };
    });

    return {
      id: p.id,
      name: p.name,
      publicationDays: p.publication_days,
      maxAdFileSize: p.max_ad_file_size,
      grid: grid ? { columns: grid.columns, rows: grid.rows } : null,
      /** Quantity packages, so the form can price a whole request as approval would. */
      packages: packages[p.id] ?? [],
      // Largest first — "a full page" before "a quarter" is how a price list
      // reads, and it keeps the proportions from jumping around.
      shapes: estimated.sort((a, b) => b.cols * b.rows - a.cols * a.rows),
    };
  });
}

export type PortalFormNewspaper = Awaited<ReturnType<typeof portalFormOptions>>[number];

/** The shape a request is listed and shown in. */
const REQUEST_SELECT = {
  id: true,
  number: true,
  status: true,
  /** An estimate while pending; approval freezes it (conventions.md §7). */
  total_price: true,
  publications: { select: { price: true, status: true } },
  rejection_reason: true,
  created_at: true,
  updated_at: true,
  approved_at: true,
  completed_at: true,
  advertisement: {
    select: { id: true, name: true, file_type: true, file_size: true, preview_url: true },
  },
  items: {
    orderBy: { publication_date: "asc" },
    select: {
      id: true,
      publication_date: true,
      newspaper: { select: { id: true, name: true } },
      ad_shape: { select: { id: true, name: true, cols: true, rows: true } },
      advertisement: {
        select: { id: true, name: true, file_type: true, file_size: true, preview_url: true },
      },
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

/** The uploaded files as the server knows them, for rule 4. Someone else's id finds nothing. */
export async function portalAdvertisements(scope: CustomerScope, ids: string[]) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return [];
  return customerDb(scope).advertisement.findMany({
    where: { id: { in: wanted } },
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
): Promise<{ id: string }> {
  // withAudit, because the request and the record of who sent it commit
  // together (backlog 25, conventions.md §6). The id is not known until the
  // order exists, so the audit target is the customer and the order is named
  // in `new`.
  const created = await withAudit(
    { businessId: scope.businessId, userId: scope.userId },
    { action: "portal_submit_request", targetType: "Customer", targetId: scope.customerId },
    async (tx) => {
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
      await tx.adOrderItem.createMany({
        data: record.items.map((item) => ({
          ...item,
          order_id: order.id,
          publication_date: new Date(`${item.publication_date}T00:00:00Z`),
        })),
      });
      return {
        new: {
          orderId: order.id,
          number,
          publications: record.items.length,
          dates: [...new Set(record.items.map((i) => i.publication_date))],
          advertisements: [...new Set(record.items.map((i) => i.advertisement_id))],
          estimate: record.order.total_price,
        },
        result: order,
      };
    },
  );
  return created!;
}

class NothingToCancel extends Error {}

/**
 * Rule 8: a customer withdraws only what nobody has acted on yet.
 *
 * The status is part of the WHERE, so a request approved a second before the
 * customer clicked is not cancelled out from under the approval — the update
 * matches nothing, the transaction is rolled back with its audit row, and the
 * caller says so.
 */
export async function cancelPortalRequest(scope: CustomerScope, id: string): Promise<boolean> {
  try {
    await withAudit(
      { businessId: scope.businessId, userId: scope.userId },
      { action: "portal_cancel_request", targetType: "AdOrder", targetId: id },
      async (tx) => {
        const result = await tx.adOrder.updateMany({
          where: {
            id,
            business_id: scope.businessId,
            customer_id: scope.customerId,
            source: "customer_portal",
            status: "pending_approval",
          },
          data: { status: "canceled" },
        });
        if (result.count !== 1) throw new NothingToCancel();
        return { old: { status: "pending_approval" }, new: { status: "canceled" } };
      },
    );
    return true;
  } catch (e) {
    if (e instanceof NothingToCancel) return false;
    throw e;
  }
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
  /** Where the file is going, for the record: a new request or a publication. */
  context: { newspaperId: string; publicationId?: string },
) {
  const done = await withAudit(
    { businessId: scope.businessId, userId: scope.userId },
    { action: "portal_upload_ad", targetType: "Advertisement", targetId: id },
    async (tx) => {
      const ad = await tx.advertisement.update({
        // Both walls by hand: this is the raw transaction client.
        where: { id, business_id: scope.businessId, customer_id: scope.customerId },
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
      return {
        new: { name: ad.name, fileSize: ad.file_size, ...context },
        result: ad,
      };
    },
  );
  return done!;
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

// --- Publications waiting for artwork (backlog 24) ----------------------------

/**
 * The customer's own publications that still have no file and can take one.
 *
 * Future dates only: a publication whose date passed without artwork is a
 * conversation for the office, not an upload button. Binding orders only —
 * a publication exists only once an order is approved, but a cancelled order
 * leaves its publications behind.
 */
export async function publicationsAwaitingArtwork(scope: CustomerScope, today: Date) {
  return customerDb(scope).publication.findMany({
    where: {
      advertisement_id: null,
      status: { in: ["planned", "missing_ad"] },
      publication_date: { gte: today },
      order: { status: { in: ["approved", "completed"] } },
    },
    orderBy: { publication_date: "asc" },
    select: {
      id: true,
      publication_date: true,
      status: true,
      newspaper: { select: { id: true, name: true, max_ad_file_size: true } },
      ad_shape: { select: { name: true } },
      order: { select: { number: true } },
    },
  });
}

export async function portalPublicationTarget(scope: CustomerScope, publicationId: string) {
  return customerDb(scope).publication.findFirst({
    where: { id: publicationId },
    select: {
      id: true,
      status: true,
      advertisement_id: true,
      publication_date: true,
      order: { select: { status: true } },
      newspaper: { select: { id: true, name: true, max_ad_file_size: true } },
    },
  });
}

// --- Account (backlog 23) ------------------------------------------------------

/**
 * The customer's money, from the SAME functions the internal customer card
 * reads (lib/data/payments.ts). Two implementations would eventually quote the
 * customer one balance and the office another.
 *
 * They are called with the scope's own business and customer, never with an id
 * from the request — which is the whole of what customerDb would have added.
 * customerDb still refuses `Payment` itself, so no other portal code can
 * reach the table by accident.
 */
export async function portalAccount(scope: CustomerScope) {
  const [{ account }, credit, payments, publications] = await Promise.all([
    customerAccount(scope.businessId, scope.customerId),
    customerCredit(scope.businessId, scope.customerId),
    paymentsForCustomer(scope.businessId, scope.customerId),
    customerDb(scope).publication.findMany({
      where: { order: { status: { in: ["approved", "completed"] } } },
      orderBy: { publication_date: "desc" },
      take: 200,
      select: {
        id: true,
        publication_date: true,
        price: true,
        status: true,
        newspaper: { select: { name: true } },
        ad_shape: { select: { name: true } },
        order: { select: { number: true } },
      },
    }),
  ]);

  return {
    account,
    credit,
    net: account.outstanding - credit,
    publications: publications.map((p) => ({ ...p, price: Number(p.price) })),
    // Only what a customer should see of a payment: when, how much, which
    // invoice. Not who in the office typed it, and not a cancelled entry.
    payments: payments
      .filter((p) => p.status !== "canceled")
      .map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        date: p.payment_date,
        invoice: p.external_invoice_number,
        orderNumber: p.order?.number ?? null,
      })),
  };
}
