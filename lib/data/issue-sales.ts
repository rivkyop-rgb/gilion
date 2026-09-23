/**
 * Selling a page into an issue that is already open on screen (US-007, US-002,
 * US-003).
 *
 * ── Why this exists at all ───────────────────────────────────────────────────
 * The board is where somebody can SEE that the bottom of page 5 is still empty.
 * Until now the only way to fill it was to leave, create a customer, create an
 * order, approve it, upload the artwork, and come back — six screens for one
 * decision that was already made. This is that decision, in one action.
 *
 * ── Two things it deliberately does that the order screens do not ────────────
 * 1. The order is created ALREADY APPROVED. FR-3 says nothing binding exists
 *    until approval, and that is the right default for an order somebody is
 *    still negotiating. This is not that: the file is in hand, the space is on
 *    screen, and an order left as a draft would leave the ad sitting in a queue
 *    for a person who is not in the room. The decision is recorded in the audit
 *    log, which is what makes it a deliberate act rather than a shortcut.
 * 2. It may be run by a DESIGNER, who has no write access to the orders or
 *    customers areas. The permission is on the ACTION, not the area — a
 *    designer filling a hole in a page they are laying out is not the same
 *    thing as a designer being handed the sales screens.
 *
 * Everything else is the ordinary path: the price comes from the price list and
 * is then frozen on the publication (FR-17, conventions.md §7), and the artwork
 * is attached by stage 05's own upload action, not re-implemented here.
 */
import { Prisma } from "@prisma/client";

import { basePrisma, tenantDb } from "./db";
import { nextOrderNumber } from "./orders";
import { createPublicationsForOrder } from "./orders";

import {
  contactsToStorage,
  toStorage,
  validateCustomer,
  type CustomerInput,
} from "@/lib/domain/customer";

export type BoardCustomer =
  | { kind: "existing"; customerId: string }
  /** A walk-in: created on the spot, the person as its first contact. */
  | { kind: "new"; input: CustomerInput };

export type BoardSaleInput = {
  issueId: string;
  customer: BoardCustomer;
  /** Decides which shapes are legal and which price rule applies. */
  pageTypeId: string;
  adShapeId: string;
  /** Already resolved by the caller — the list price, or what they typed over it. */
  price: number;
};

export class BoardSaleRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoardSaleRejected";
  }
}

/** The base price for this combination, or null when the list has no row. */
export async function boardPriceSuggestion(
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

/** Customers to offer in the picker, newest first — a walk-in is usually recent. */
export async function boardCustomerOptions(businessId: string) {
  const rows = await tenantDb(businessId).customer.findMany({
    orderBy: [{ created_at: "desc" }],
    select: { id: true, business_name: true, phone: true },
    take: 200,
  });
  return rows.map((c) => ({
    id: c.id,
    label: c.business_name,
    hint: c.phone ?? undefined,
  }));
}

/**
 * Creates whatever is missing so that one ad has somewhere to live: a customer
 * if this is a walk-in, an approved order, its single line, and the publication
 * for this issue's newspaper and date.
 *
 * One transaction. A customer created without the order it was created FOR is
 * a stray row nobody will ever explain, and an order without its publication is
 * a sale that does not appear on the board it was sold from.
 */
export async function createBoardSale(
  ctx: { businessId: string; userId: string },
  input: BoardSaleInput,
): Promise<{ publicationId: string; customerId: string; orderId: string }> {
  const db = tenantDb(ctx.businessId);

  const issue = await db.issue.findUnique({
    where: { id: input.issueId },
    select: { id: true, newspaper_id: true, issue_date: true },
  });
  if (!issue) throw new BoardSaleRejected("הגיליון לא נמצא");

  // The page type and the shape must both belong to this issue's newspaper, and
  // the shape must be one the page type actually allows. Checked here rather
  // than trusted from the browser: this action creates money.
  const allowed = await db.allowedAdShape.findFirst({
    where: {
      newspaper_id: issue.newspaper_id,
      page_type_id: input.pageTypeId,
      ad_shape_id: input.adShapeId,
    },
    select: { id: true },
  });
  if (!allowed) throw new BoardSaleRejected("הצורה אינה מותרת בסוג העמוד הזה");

  if (!Number.isFinite(input.price) || input.price < 0) {
    throw new BoardSaleRejected("מחיר חייב להיות מספר שאינו שלילי");
  }

  const customerId = await resolveCustomer(ctx.businessId, input.customer);

  /**
   * The audit row is written here rather than through `withAudit`, and this is
   * the one place that is right.
   *
   * `withAudit` needs the target's id BEFORE the transaction opens, and the row
   * being audited is the one this transaction creates. Inventing an id to hand
   * it, or logging a placeholder, would make the trail point at nothing. What
   * conventions.md §6 actually asks for is that the log and the action share a
   * transaction — which they do, below.
   */
  return basePrisma.$transaction(async (tx) => {
    {
      const order = await tx.adOrder.create({
        data: {
          business_id: ctx.businessId,
          customer_id: customerId,
          source: "internal",
          status: "approved",
          approved_at: new Date(),
          total_price: new Prisma.Decimal(input.price),
          // The same allocator the order builder uses, inside this transaction
          // so the counter and the order it numbers commit together.
          number: await nextOrderNumber(ctx.businessId, tx),
        },
      });

      const item = await tx.adOrderItem.create({
        data: {
          order_id: order.id,
          newspaper_id: issue.newspaper_id,
          page_type_id: input.pageTypeId,
          ad_shape_id: input.adShapeId,
          publication_date: issue.issue_date,
          price: new Prisma.Decimal(input.price),
        },
      });

      await createPublicationsForOrder(
        tx,
        {
          id: order.id,
          business_id: ctx.businessId,
          customer_id: customerId,
          source: "internal",
        },
        [
          {
            id: item.id,
            newspaper_id: issue.newspaper_id,
            ad_shape_id: input.adShapeId,
            publication_date: issue.issue_date,
            price: input.price,
          },
        ],
      );

      const publication = await tx.publication.findFirstOrThrow({
        where: { order_id: order.id },
        select: { id: true },
      });

      await tx.auditLog.create({
        data: {
          business_id: ctx.businessId,
          user_id: ctx.userId,
          action: "approve_order",
          target_type: "AdOrder",
          target_id: order.id,
          new_value: {
            customer_id: customerId,
            publication_id: publication.id,
            price: input.price,
            // What makes this row readable a year later: an approved order with
            // no approval screen behind it needs to say where it came from.
            created_from: "issue_board",
            issue_id: issue.id,
          },
        },
      });

      return { publicationId: publication.id, customerId, orderId: order.id };
    }
  });
}

/** An existing customer is used as-is; a walk-in is created on the spot. */
async function resolveCustomer(businessId: string, customer: BoardCustomer): Promise<string> {
  if (customer.kind === "existing") {
    const found = await tenantDb(businessId).customer.findUnique({
      where: { id: customer.customerId },
      select: { id: true },
    });
    if (!found) throw new BoardSaleRejected("הלקוח לא נמצא");
    return found.id;
  }

  // The same validation the customers screen runs — a walk-in created in a
  // hurry is still a customer somebody will have to invoice (US-002).
  const errors = validateCustomer(customer.input);
  if (errors.length > 0) throw new BoardSaleRejected(errors[0]!.message);

  const created = await tenantDb(businessId).customer.create({
    data: {
      ...toStorage(customer.input),
      contacts: { create: contactsToStorage(customer.input.contacts) },
    } as never,
  });
  return created.id;
}
