/**
 * Payment persistence and the billing reports (US-010, FR-7).
 *
 * The DECISION of what an order's payment status is lives in
 * lib/domain/payment-status.ts; this module reads the records, writes them, and
 * writes the derived answer back. Nothing outside here sets
 * `AdOrder.payment_status` or `Publication.payment_status` — rule 7 makes them
 * derived, and a screen that could type one would be able to say "paid" about
 * money nobody received.
 */
import type { Prisma, PublicationStatus as PublicationStatusValue } from "@prisma/client";

import { randomUUID } from "node:crypto";

import { tenantDb } from "./db";
import { withAudit } from "./audit";
import { derivePaymentStatus, type PaymentStatus } from "@/lib/domain/payment-status";
import { buildReport, type ReportOrder, type ReportPublication } from "@/lib/domain/payment-report";
import { matchesLens, type PublicationLens } from "@/lib/domain/publication-report";
import { allocatePayment, positionOf, type OpenOrder } from "@/lib/domain/payment-allocation";
import { monthlyBreakdown } from "@/lib/domain/payment-months";
import { orderNumberNeedle, skipFor, type ListParams } from "@/lib/domain/list-view";
import { summariseAccount } from "@/lib/domain/customer-account";

export type PaymentWriteContext = { businessId: string; userId: string };

export type PaymentInputRow = {
  customerId: string;
  orderId: string | null;
  amount: number;
  paymentDate: string;
  externalInvoiceNumber: string;
};

export class PaymentNotFoundError extends Error {
  constructor() {
    super("רישום התשלום לא נמצא");
    this.name = "PaymentNotFoundError";
  }
}

/**
 * Publications that are not a charge — a cancelled line is billed to nobody.
 *
 * Deliberately NOT `as const`: Prisma's `notIn` wants a mutable array and
 * refuses a frozen tuple, exactly as `ON_PAGE_STATES` had to learn (CLAUDE.md).
 */
const NOT_BILLABLE: PublicationStatusValue[] = ["canceled"];

// ---------------------------------------------------------------------------
// The derivation, written back
// ---------------------------------------------------------------------------

/**
 * Recomputes one order's payment status and pushes it down to its publications.
 *
 * Takes the transaction client, because every caller is already inside one: the
 * payment row and the status it implies must land together or not at all. A
 * status computed from a payment that was rolled back is a number the screen
 * shows and the database cannot justify.
 *
 * Runs on the RAW client, so every query names `business_id` itself — inside a
 * `withAudit` transaction there is no tenant extension to lean on
 * (conventions.md §2).
 */
export async function recalcOrderPaymentStatus(
  tx: Prisma.TransactionClient,
  businessId: string,
  orderId: string,
): Promise<PaymentStatus | null> {
  const order = await tx.adOrder.findFirst({
    where: { id: orderId, business_id: businessId },
    select: { id: true, total_price: true, payment_status: true },
  });
  if (!order) return null;

  const [payments, publications] = await Promise.all([
    tx.payment.findMany({
      where: { order_id: orderId, business_id: businessId },
      select: { amount: true, status: true },
    }),
    tx.publication.findMany({
      where: { order_id: orderId, business_id: businessId },
      select: { id: true, status: true },
    }),
  ]);

  const next = derivePaymentStatus({
    totalPrice: Number(order.total_price),
    payments: payments.map((p) => ({
      amount: Number(p.amount),
      canceled: p.status === "canceled",
    })),
    publicationStatuses: publications.map((p) => p.status),
  });

  await tx.adOrder.updateMany({
    where: { id: orderId, business_id: businessId },
    data: { payment_status: next },
  });

  // Rule 8: the publication inherits, in the same transaction. There is no
  // per-publication payment in the MVP, so this is a copy and not a second
  // calculation that could drift.
  await tx.publication.updateMany({
    where: { order_id: orderId, business_id: businessId },
    data: { payment_status: next },
  });

  return next;
}

/**
 * Recomputes every order behind a set of publications.
 *
 * Called by the issue close: publications going `published` is exactly the
 * event that turns "not paid yet" into a debt (rule 7), and without this the
 * dashboard's "who owes money" would only ever notice when somebody happened to
 * open a payment form.
 */
export async function recalcOrdersForPublications(
  tx: Prisma.TransactionClient,
  businessId: string,
  publicationIds: string[],
): Promise<void> {
  if (publicationIds.length === 0) return;
  const rows = await tx.publication.findMany({
    where: { id: { in: publicationIds }, business_id: businessId },
    select: { order_id: true },
  });
  for (const orderId of new Set(rows.map((r) => r.order_id))) {
    await recalcOrderPaymentStatus(tx, businessId, orderId);
  }
}

// ---------------------------------------------------------------------------
// Writes — all three audited under `update_payment` (rule 9)
// ---------------------------------------------------------------------------

function dateOrNull(iso: string): Date | null {
  return iso ? new Date(`${iso}T00:00:00Z`) : null;
}

export type RecordedPayment = {
  /** Every row the act produced — one per order it settled, plus the credit. */
  ids: string[];
  /** Set when the payment named a single order. */
  status: PaymentStatus | null;
  allocations: Array<{ orderId: string; number: number; amount: number }>;
  /** Money that reached no order and is now the customer's to spend. */
  credit: number;
};

/**
 * Records one act of paying.
 *
 * Two shapes, and the difference is whether a person named an order:
 *
 *  - NAMED: one row against that order, exactly as before. Overpaying it is
 *    allowed (rule 2), because doing so is a deliberate act.
 *  - UNNAMED: the sum is split across the open orders oldest first
 *    (lib/domain/payment-allocation.ts) and written as one row per order, plus
 *    a row with no order for whatever is left. Those rows share a `group_id`
 *    so the screen can show them as the single act they were.
 *
 * Writing real rows rather than one row with a stored split is what keeps
 * every reader downstream simple: `paidByOrder`, the period report's
 * apportioning and the invoice list all keep asking one question — how much
 * was paid against this order — and none of them has to learn about splitting.
 */
export async function recordPayment(
  ctx: PaymentWriteContext,
  input: PaymentInputRow,
): Promise<RecordedPayment | undefined> {
  // Read outside the transaction only to fail early with a readable message;
  // the write below re-scopes by business_id regardless.
  const customer = await tenantDb(ctx.businessId).customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });
  if (!customer) throw new PaymentNotFoundError();

  if (input.orderId) {
    // Rule 6: an order from a different customer — or a different business —
    // is not a thing this payment may name.
    const order = await tenantDb(ctx.businessId).adOrder.findFirst({
      where: { id: input.orderId, customer_id: input.customerId },
      select: { id: true },
    });
    if (!order) throw new PaymentNotFoundError();
  }

  // Computed BEFORE the transaction opens so the confirmation can quote it,
  // and recomputed from the same rows inside — see the note in the split
  // branch below.
  const plan = input.orderId
    ? null
    : allocatePayment(input.amount, await openOrdersOf(ctx.businessId, input.customerId));

  return withAudit(
    ctx,
    { action: "update_payment", targetType: "Payment", targetId: input.customerId },
    async (tx) => {
      const groupId = plan && plan.allocations.length > 1 ? randomUUID() : null;
      const common = {
        business_id: ctx.businessId,
        customer_id: input.customerId,
        updated_by_user_id: ctx.userId,
        payment_date: dateOrNull(input.paymentDate),
        external_invoice_number: input.externalInvoiceNumber || null,
        ...(groupId ? { group_id: groupId } : {}),
      };

      // --- named order: one row, unchanged ---------------------------------
      if (!plan) {
        const created = await tx.payment.create({
          data: { ...common, order_id: input.orderId, amount: input.amount },
          select: { id: true, amount: true, order_id: true },
        });
        const status = await recalcOrderPaymentStatus(tx, ctx.businessId, created.order_id!);

        return {
          // No old value: nothing existed before. The delta is the whole record.
          old: null,
          new: {
            payment_id: created.id,
            amount: Number(created.amount),
            order_id: created.order_id,
            payment_date: input.paymentDate || null,
            external_invoice_number: input.externalInvoiceNumber || null,
            order_payment_status: status,
          },
          result: {
            ids: [created.id],
            status,
            allocations: [
              { orderId: created.order_id!, number: 0, amount: Number(created.amount) },
            ],
            credit: 0,
          } satisfies RecordedPayment,
        };
      }

      // --- unnamed: split across what is open ------------------------------
      const ids: string[] = [];
      // Kept when the split turned out to land on exactly ONE order — the
      // ordinary case of "he paid what he owed". The screen then reports the
      // status it reached, the same as a payment that named that order; with
      // nothing to report the confirmation could only say "נשמר", which is the
      // one thing the person already knows.
      let singleStatus: PaymentStatus | null = null;

      for (const allocation of plan.allocations) {
        const row = await tx.payment.create({
          data: { ...common, order_id: allocation.orderId, amount: allocation.amount },
          select: { id: true },
        });
        ids.push(row.id);
        const next = await recalcOrderPaymentStatus(tx, ctx.businessId, allocation.orderId);
        if (plan.allocations.length === 1) singleStatus = next;
      }

      if (plan.leftover > 0) {
        const row = await tx.payment.create({
          data: { ...common, order_id: null, amount: plan.leftover },
          select: { id: true },
        });
        ids.push(row.id);
      }

      return {
        old: null,
        new: {
          amount: input.amount,
          split_across: plan.allocations.length,
          allocations: plan.allocations,
          credit: plan.leftover,
          payment_date: input.paymentDate || null,
          external_invoice_number: input.externalInvoiceNumber || null,
        },
        result: {
          ids,
          status: singleStatus,
          allocations: plan.allocations,
          credit: plan.leftover,
        } satisfies RecordedPayment,
      };
    },
  );
}

export async function updatePayment(
  ctx: PaymentWriteContext,
  paymentId: string,
  input: Omit<PaymentInputRow, "customerId">,
) {
  const existing = await tenantDb(ctx.businessId).payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      customer_id: true,
      order_id: true,
      amount: true,
      payment_date: true,
      external_invoice_number: true,
      status: true,
    },
  });
  if (!existing) throw new PaymentNotFoundError();

  if (input.orderId) {
    const order = await tenantDb(ctx.businessId).adOrder.findFirst({
      where: { id: input.orderId, customer_id: existing.customer_id },
      select: { id: true },
    });
    if (!order) throw new PaymentNotFoundError();
  }

  return withAudit(
    ctx,
    { action: "update_payment", targetType: "Payment", targetId: paymentId },
    async (tx) => {
      await tx.payment.updateMany({
        where: { id: paymentId, business_id: ctx.businessId },
        data: {
          order_id: input.orderId,
          amount: input.amount,
          payment_date: dateOrNull(input.paymentDate),
          external_invoice_number: input.externalInvoiceNumber || null,
          updated_by_user_id: ctx.userId,
        },
      });

      // BOTH orders, when the payment moved between them: the one it left is
      // owed money again, and only recomputing the destination would leave the
      // source claiming it was paid.
      const touched = new Set(
        [existing.order_id, input.orderId].filter((id): id is string => !!id),
      );
      let status: PaymentStatus | null = null;
      for (const orderId of touched) {
        const next = await recalcOrderPaymentStatus(tx, ctx.businessId, orderId);
        if (orderId === input.orderId) status = next;
      }

      return {
        old: {
          amount: Number(existing.amount),
          order_id: existing.order_id,
          payment_date: existing.payment_date ? isoDay(existing.payment_date) : null,
          external_invoice_number: existing.external_invoice_number,
        },
        new: {
          amount: input.amount,
          order_id: input.orderId,
          payment_date: input.paymentDate || null,
          external_invoice_number: input.externalInvoiceNumber || null,
          order_payment_status: status,
        },
        result: { id: paymentId, status },
      };
    },
  );
}

/**
 * Rule 10 — cancelling, never deleting.
 *
 * The record stays and stops counting. A deleted row would take the audit
 * trail's subject with it, and "there used to be a payment here and somebody
 * removed it" is precisely the fact US-010 AC-5 exists to preserve.
 */
export async function cancelPayment(ctx: PaymentWriteContext, paymentId: string) {
  const existing = await tenantDb(ctx.businessId).payment.findUnique({
    where: { id: paymentId },
    select: { id: true, order_id: true, amount: true, status: true, group_id: true },
  });
  if (!existing) throw new PaymentNotFoundError();

  // A split payment was ONE act, so undoing it is one act too. Cancelling a
  // single slice of a ₪5,000 payment would leave the other slices standing and
  // the customer's balance describing a payment that half happened.
  const siblings = existing.group_id
    ? await tenantDb(ctx.businessId).payment.findMany({
        where: { group_id: existing.group_id },
        select: { id: true, order_id: true },
      })
    : [{ id: existing.id, order_id: existing.order_id }];

  return withAudit(
    ctx,
    { action: "update_payment", targetType: "Payment", targetId: paymentId },
    async (tx) => {
      const next = existing.status === "canceled" ? "recorded" : "canceled";
      await tx.payment.updateMany({
        where: { id: { in: siblings.map((r) => r.id) }, business_id: ctx.businessId },
        data: { status: next, updated_by_user_id: ctx.userId },
      });

      let status: PaymentStatus | null = null;
      for (const orderId of new Set(
        siblings.map((r) => r.order_id).filter((id): id is string => id !== null),
      )) {
        const recomputed = await recalcOrderPaymentStatus(tx, ctx.businessId, orderId);
        if (orderId === existing.order_id) status = recomputed;
      }

      return {
        old: { status: existing.status, amount: Number(existing.amount) },
        new: {
          status: next,
          order_payment_status: status,
          ...(existing.group_id ? { rows_in_group: siblings.length } : {}),
        },
        result: { id: paymentId, status: next, affected: siblings.length },
      };
    },
  );
}

/**
 * Puts a customer's credit onto one order (the prompt at approval).
 *
 * The credit is already real money on real rows — rows with no `order_id`. So
 * applying it is not a new payment, it is those rows being told where they
 * went: a row smaller than what is open moves whole, and a row bigger than what
 * is open is split, leaving the remainder unallocated.
 *
 * Rewriting the existing rows rather than writing a fresh payment is what keeps
 * the customer's total received unchanged by the act. Anything else would show
 * the money twice.
 */
export async function applyCreditToOrder(ctx: PaymentWriteContext, orderId: string) {
  const db = tenantDb(ctx.businessId);
  const order = await db.adOrder.findUnique({
    where: { id: orderId },
    select: { id: true, customer_id: true, total_price: true, status: true },
  });
  if (!order) throw new PaymentNotFoundError();

  const paid = await paidByOrder(ctx.businessId, [orderId]);
  const open = round2(Math.max(0, Number(order.total_price) - (paid.get(orderId) ?? 0)));
  if (open <= 0) return { applied: 0, status: null as PaymentStatus | null };

  const creditRows = await db.payment.findMany({
    where: { customer_id: order.customer_id, order_id: null, status: "recorded" },
    orderBy: [{ payment_date: "asc" }, { created_at: "asc" }],
    select: {
      id: true,
      amount: true,
      payment_date: true,
      external_invoice_number: true,
      group_id: true,
    },
  });
  if (creditRows.length === 0) return { applied: 0, status: null as PaymentStatus | null };

  return withAudit(
    ctx,
    { action: "update_payment", targetType: "Payment", targetId: orderId },
    async (tx) => {
      let remaining = open;
      let applied = 0;

      for (const row of creditRows) {
        if (remaining <= 0) break;
        const amount = Number(row.amount);
        const take = round2(Math.min(amount, remaining));

        if (take >= amount) {
          // The whole row belongs to this order now.
          await tx.payment.updateMany({
            where: { id: row.id, business_id: ctx.businessId },
            data: { order_id: orderId, updated_by_user_id: ctx.userId },
          });
        } else {
          // Part of it does. The rest stays the customer's.
          await tx.payment.updateMany({
            where: { id: row.id, business_id: ctx.businessId },
            data: { amount: round2(amount - take), updated_by_user_id: ctx.userId },
          });
          await tx.payment.create({
            data: {
              business_id: ctx.businessId,
              customer_id: order.customer_id,
              order_id: orderId,
              updated_by_user_id: ctx.userId,
              amount: take,
              payment_date: row.payment_date,
              external_invoice_number: row.external_invoice_number,
              group_id: row.group_id,
            },
          });
        }

        applied = round2(applied + take);
        remaining = round2(remaining - take);
      }

      const status = await recalcOrderPaymentStatus(tx, ctx.businessId, orderId);

      return {
        old: { order_credit_applied: 0 },
        new: { order_id: orderId, credit_applied: applied, order_payment_status: status },
        result: { applied, status },
      };
    },
  );
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function paymentsForCustomer(businessId: string, customerId: string) {
  return tenantDb(businessId).payment.findMany({
    where: { customer_id: customerId },
    orderBy: [{ payment_date: "desc" }, { created_at: "desc" }],
    select: {
      id: true,
      amount: true,
      payment_date: true,
      external_invoice_number: true,
      status: true,
      order_id: true,
      order: { select: { number: true } },
      group_id: true,
      created_at: true,
      updated_at: true,
      updated_by: { select: { name: true } },
    },
    take: 200,
  });
}

/**
 * The customer card's payment list: one page of it, with its total.
 *
 * Its own function rather than options on `paymentsForCustomer`, which the
 * billing window uses whole — a shared signature that sometimes pages and
 * sometimes does not is a signature every caller has to read twice.
 */
export async function customerPaymentsPage(
  businessId: string,
  customerId: string,
  params: ListParams,
) {
  const db = tenantDb(businessId);
  const wanted = orderNumberNeedle(params.q);
  const where: Prisma.PaymentWhereInput = {
    customer_id: customerId,
    ...(params.q
      ? {
          OR: [
            { external_invoice_number: { contains: params.q, mode: "insensitive" as const } },
            ...(wanted === null ? [] : [{ order: { number: wanted } }]),
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.payment.findMany({
      where,
      orderBy: [{ payment_date: "desc" }, { created_at: "desc" }],
      skip: skipFor(params),
      take: params.size,
      select: {
        id: true,
        amount: true,
        payment_date: true,
        external_invoice_number: true,
        status: true,
        order_id: true,
        order: { select: { number: true } },
        updated_at: true,
        updated_by: { select: { name: true } },
      },
    }),
    db.payment.count({ where }),
  ]);
  return { rows, total };
}

/** Live payment totals per order — what the customer card and the report need. */
export async function paidByOrder(
  businessId: string,
  orderIds: string[],
): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const rows = await tenantDb(businessId).payment.findMany({
    where: { order_id: { in: orderIds }, status: "recorded" },
    select: { order_id: true, amount: true },
  });
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.order_id) continue;
    totals.set(row.order_id, (totals.get(row.order_id) ?? 0) + Number(row.amount));
  }
  return totals;
}

/**
 * Money this customer handed over that reached no order — their credit.
 *
 * This is the number the first version of the screen lost entirely: a payment
 * with no `order_id` matched no `order_id: { in: [...] }` filter, so it was
 * recorded, listed, and counted nowhere. It showed as a row in the history
 * while every total on the page carried on as if it had not happened, and
 * nothing on screen admitted it.
 */
export async function customerCredit(businessId: string, customerId: string): Promise<number> {
  const rows = await tenantDb(businessId).payment.findMany({
    where: { customer_id: customerId, order_id: null, status: "recorded" },
    select: { amount: true },
  });
  return round2(rows.reduce((sum, r) => sum + Number(r.amount), 0));
}

/** The same thing for every customer at once — the billing table needs it per row. */
export async function creditByCustomer(businessId: string): Promise<Map<string, number>> {
  const rows = await tenantDb(businessId).payment.findMany({
    where: { order_id: null, status: "recorded" },
    select: { customer_id: true, amount: true },
  });
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.customer_id, round2((totals.get(row.customer_id) ?? 0) + Number(row.amount)));
  }
  return totals;
}

/**
 * The orders a split may settle: binding, and still owing something.
 *
 * Read fresh rather than taken from the screen, because the screen was rendered
 * before the person started typing and another payment may have landed since.
 */
export async function openOrdersOf(businessId: string, customerId: string): Promise<OpenOrder[]> {
  const orders = await tenantDb(businessId).adOrder.findMany({
    where: { customer_id: customerId, status: { in: ["approved", "completed"] } },
    select: { id: true, number: true, total_price: true, created_at: true },
  });
  const paid = await paidByOrder(
    businessId,
    orders.map((o) => o.id),
  );
  return orders
    .map((o) => ({
      orderId: o.id,
      number: o.number,
      open: round2(Math.max(0, Number(o.total_price) - (paid.get(o.id) ?? 0))),
      createdAt: o.created_at,
    }))
    .filter((o) => o.open > 0);
}

/**
 * What this customer owes, month by month — the panel's main table.
 *
 * Built from PUBLICATIONS, because a month is the publication date and nothing
 * else. Orders are read only for the denominators the apportioning needs.
 */
export async function customerMonths(businessId: string, customerId: string) {
  const db = tenantDb(businessId);

  // Only publications on BINDING orders: a draft has not charged anybody, and
  // showing its dates as debt would put months on the screen the customer has
  // never been asked to pay for.
  const publications = await db.publication.findMany({
    where: { customer_id: customerId, order: { status: { in: ["approved", "completed"] } } },
    orderBy: { publication_date: "asc" },
    select: { publication_date: true, price: true, order_id: true, status: true },
    take: 2000,
  });
  if (publications.length === 0) return monthlyBreakdown([], new Map(), new Map());

  const orderIds = [...new Set(publications.map((p) => p.order_id))];
  const [orderTotals, orderPaid] = await Promise.all([
    billableTotalsByOrder(businessId, orderIds),
    paidByOrder(businessId, orderIds),
  ]);

  return monthlyBreakdown(
    publications.map((p) => ({
      date: p.publication_date,
      price: Number(p.price),
      orderId: p.order_id,
      status: p.status,
    })),
    orderTotals,
    orderPaid,
  );
}

/**
 * The customer card's money, and the months it is made of, from ONE read.
 *
 * Both answers come off the same publication rows, which is what makes the
 * tiles and the table under them agree by construction rather than by luck.
 */
export async function customerAccount(businessId: string, customerId: string) {
  const rows = await tenantDb(businessId).publication.findMany({
    where: { customer_id: customerId },
    orderBy: { publication_date: "asc" },
    select: {
      publication_date: true,
      price: true,
      order_id: true,
      status: true,
      order: { select: { status: true } },
    },
    take: 2000,
  });

  const orderIds = [...new Set(rows.map((r) => r.order_id))];
  const [orderTotals, orderPaid] = await Promise.all([
    billableTotalsByOrder(businessId, orderIds),
    paidByOrder(businessId, orderIds),
  ]);

  const account = summariseAccount(
    rows.map((r) => ({
      orderId: r.order_id,
      orderStatus: r.order.status,
      status: r.status,
      price: Number(r.price),
    })),
    orderPaid,
  );

  // The monthly table shows only what is actually charged, so it reads the
  // binding rows alone — same filter the summary applies.
  const monthly = monthlyBreakdown(
    rows
      .filter((r) => BINDING_ORDER_STATUSES.includes(r.order.status))
      .map((r) => ({
        date: r.publication_date,
        price: Number(r.price),
        orderId: r.order_id,
        status: r.status,
      })),
    orderTotals,
    orderPaid,
  );

  return { account, ...monthly };
}

/**
 * The card's headline number — outstanding less credit — for a page of
 * customers at once, for the customer list's "יתרת חוב" column.
 *
 * The SAME computation as the card (`summariseAccount` over the customer's
 * publications, then the unassigned credit taken off), batched: one read of
 * publications, one of payments. A list that computed its own figure would
 * sooner or later disagree with the card one click away, and the user would
 * see the contradiction before we did. Until 23/09/2026 the column was a
 * hard-coded ₪0 on every row.
 */
export async function netByCustomer(
  businessId: string,
  customerIds: string[],
): Promise<Map<string, number>> {
  if (customerIds.length === 0) return new Map();
  const rows = await tenantDb(businessId).publication.findMany({
    where: { customer_id: { in: customerIds } },
    select: {
      customer_id: true,
      price: true,
      order_id: true,
      status: true,
      order: { select: { status: true } },
    },
  });

  const [orderPaid, credits] = await Promise.all([
    paidByOrder(businessId, [...new Set(rows.map((r) => r.order_id))]),
    creditByCustomer(businessId),
  ]);

  const byCustomer = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push(r);
    byCustomer.set(r.customer_id, list);
  }

  const net = new Map<string, number>();
  for (const id of customerIds) {
    const account = summariseAccount(
      (byCustomer.get(id) ?? []).map((r) => ({
        orderId: r.order_id,
        orderStatus: r.order.status,
        status: r.status,
        price: Number(r.price),
      })),
      orderPaid,
    );
    net.set(id, positionOf(account.outstanding, credits.get(id) ?? 0).net);
  }
  return net;
}

/** Orders that charge anything. Mirrors lib/domain/customer-account.ts. */
const BINDING_ORDER_STATUSES = ["approved", "completed"];

export type BillingCustomerRow = {
  customerId: string;
  label: string;
  billed: number;
  paid: number;
  outstanding: number;
  /** Money held with no order named against it. Never folded into `paid`. */
  credit: number;
  /** outstanding − credit. Negative means the customer is ahead. */
  net: number;
  status: PaymentStatus;
  orderCount: number;
  invoiceNumbers: string[];
};

/**
 * The billing screen's table: one row per customer with an open commitment.
 *
 * Built from ORDERS, not publications: this screen is about what a customer
 * owes in total, which is an order-level fact. The publication-level view is
 * the second report tab, and it answers a different question.
 */
export async function billingCustomers(
  businessId: string,
  filter: { status?: string; q?: string } = {},
): Promise<BillingCustomerRow[]> {
  const db = tenantDb(businessId);
  const orders = await db.adOrder.findMany({
    where: { status: { in: ["approved", "completed"] } },
    select: {
      id: true,
      customer_id: true,
      total_price: true,
      payment_status: true,
      external_invoice_number: true,
      customer: { select: { id: true, business_name: true } },
    },
  });

  const paid = await paidByOrder(
    businessId,
    orders.map((o) => o.id),
  );

  const invoicesByOrder = await invoiceNumbersByOrder(
    businessId,
    orders.map((o) => o.id),
  );

  const credits = await creditByCustomer(businessId);

  // Billable totals and NOT `AdOrder.total_price`: cancelling a publication
  // does not reduce that field — it is the price at approval and stays as a
  // record — so an order total keeps charging for a line nobody will print.
  // The customer card sums live publications, and two money screens that
  // disagree about one customer is worse than either being slightly off.
  const billableTotals = await billableTotalsByOrder(
    businessId,
    orders.map((o) => o.id),
  );

  const byCustomer = new Map<string, BillingCustomerRow>();
  for (const order of orders) {
    const label = order.customer.business_name;
    const row = byCustomer.get(order.customer_id) ?? {
      customerId: order.customer_id,
      label,
      billed: 0,
      paid: 0,
      outstanding: 0,
      credit: credits.get(order.customer_id) ?? 0,
      net: 0,
      status: "paid" as PaymentStatus,
      orderCount: 0,
      invoiceNumbers: [],
    };

    const total = billableTotals.get(order.id) ?? 0;
    const received = paid.get(order.id) ?? 0;
    row.billed += total;
    row.paid += Math.min(received, total);
    row.outstanding += Math.max(0, total - received);
    row.orderCount += 1;

    for (const inv of [order.external_invoice_number, ...(invoicesByOrder.get(order.id) ?? [])]) {
      if (inv && !row.invoiceNumbers.includes(inv)) row.invoiceNumbers.push(inv);
    }

    // The worst status among the customer's orders is the one worth showing:
    // somebody with one settled order and one debt is a debtor, and a row that
    // said "paid" would take them off the list that exists to find them.
    row.status = worseOf(row.status, order.payment_status as PaymentStatus);
    byCustomer.set(order.customer_id, row);
  }

  // A customer whose only money is a credit has no binding order, so the loop
  // above never created a row for them. They still belong on this screen —
  // money the business is holding is exactly what the screen is for.
  for (const [customerId, credit] of credits) {
    if (credit <= 0 || byCustomer.has(customerId)) continue;
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { business_name: true },
    });
    if (!customer) continue;
    byCustomer.set(customerId, {
      customerId,
      label: customer.business_name,
      billed: 0,
      paid: 0,
      outstanding: 0,
      credit,
      net: 0,
      status: "paid",
      orderCount: 0,
      invoiceNumbers: [],
    });
  }

  let rows = [...byCustomer.values()];
  if (filter.status && filter.status !== "all") {
    rows = rows.filter((r) => r.status === filter.status);
  }
  if (filter.q) {
    const needle = filter.q.trim().toLowerCase();
    if (needle) rows = rows.filter((r) => r.label.toLowerCase().includes(needle));
  }

  rows.sort((a, b) => b.outstanding - a.outstanding || b.billed - a.billed);
  return rows.map((r) => {
    // Kept apart, never netted into `paid`: a credit is not money against these
    // invoices, and folding it in would push `שולם` above `לחיוב` and make the
    // row unreadable. `net` is the one number that combines them, and it says
    // which side it falls on.
    const position = positionOf(r.outstanding, r.credit);
    return {
      ...r,
      billed: round2(r.billed),
      paid: round2(r.paid),
      outstanding: position.outstanding,
      credit: position.credit,
      net: position.net,
    };
  });
}

/** Severity order for the roll-up above. `debt` beats everything. */
const SEVERITY: Record<PaymentStatus, number> = {
  paid: 0,
  unpaid: 1,
  partially_paid: 2,
  debt: 3,
};

function worseOf(a: PaymentStatus, b: PaymentStatus): PaymentStatus {
  return SEVERITY[b] > SEVERITY[a] ? b : a;
}

async function invoiceNumbersByOrder(
  businessId: string,
  orderIds: string[],
): Promise<Map<string, string[]>> {
  if (orderIds.length === 0) return new Map();
  const rows = await tenantDb(businessId).payment.findMany({
    where: {
      order_id: { in: orderIds },
      status: "recorded",
      external_invoice_number: { not: null },
    },
    select: { order_id: true, external_invoice_number: true },
  });
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.order_id || !row.external_invoice_number) continue;
    const list = map.get(row.order_id) ?? [];
    if (!list.includes(row.external_invoice_number)) list.push(row.external_invoice_number);
    map.set(row.order_id, list);
  }
  return map;
}

/** Every order of one customer that a payment may be recorded against. */
export async function billableOrders(businessId: string, customerId: string) {
  const orders = await tenantDb(businessId).adOrder.findMany({
    where: { customer_id: customerId, status: { in: ["approved", "completed"] } },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      number: true,
      total_price: true,
      payment_status: true,
      created_at: true,
      external_invoice_number: true,
    },
    take: 100,
  });
  const paid = await paidByOrder(
    businessId,
    orders.map((o) => o.id),
  );
  return orders.map((o) => {
    const received = paid.get(o.id) ?? 0;
    return {
      id: o.id,
      number: o.number,
      totalPrice: round2(Number(o.total_price)),
      paid: round2(received),
      // What the per-order table shows, and what the split queue consumes.
      open: round2(Math.max(0, Number(o.total_price) - received)),
      paymentStatus: o.payment_status as PaymentStatus,
      createdAt: o.created_at,
      invoiceNumber: o.external_invoice_number,
    };
  });
}

/**
 * Who changed the money on this customer, and what moved (US-010 AC-5).
 *
 * Read from the audit log rather than from a column on Payment, because the
 * question is "what did it used to be" and only the log holds that.
 */
export async function paymentHistory(businessId: string, paymentIds: string[], customerId: string) {
  const targets = [...paymentIds, customerId];
  if (targets.length === 0) return [];
  return tenantDb(businessId).auditLog.findMany({
    where: { action: "update_payment", target_id: { in: targets } },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      created_at: true,
      old_value: true,
      new_value: true,
      target_id: true,
      user: { select: { name: true } },
    },
    take: 50,
  });
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type ReportFilters = {
  from: string;
  to: string;
  newspaperId?: string;
  customerId?: string;
};

function dateWhere(from: string, to: string) {
  const range: { gte?: Date; lte?: Date } = {};
  if (from) range.gte = new Date(`${from}T00:00:00Z`);
  if (to) range.lte = new Date(`${to}T00:00:00Z`);
  return Object.keys(range).length > 0 ? range : undefined;
}

/**
 * The per-customer billing report for a period (PRD §7 success criterion).
 *
 * Reads publications and then the orders behind them, rather than orders with
 * their publications: the period is a property of the PUBLICATION date, and an
 * order-first query would have to decide what date an order has.
 */
export async function billingReport(businessId: string, filters: ReportFilters) {
  const db = tenantDb(businessId);
  const publications = await db.publication.findMany({
    where: {
      publication_date: dateWhere(filters.from, filters.to),
      ...(filters.newspaperId && filters.newspaperId !== "all"
        ? { newspaper_id: filters.newspaperId }
        : {}),
      ...(filters.customerId && filters.customerId !== "all"
        ? { customer_id: filters.customerId }
        : {}),
    },
    select: {
      id: true,
      customer_id: true,
      newspaper_id: true,
      order_id: true,
      price: true,
      status: true,
      customer: { select: { business_name: true } },
    },
    take: 5000,
  });

  const orderIds = [...new Set(publications.map((p) => p.order_id))];

  // The order's OWN billable total, not the filtered slice: apportioning a
  // payment needs the denominator the payment was made against, and using the
  // period's subtotal would attribute the whole payment to whatever part of the
  // order happens to be on screen.
  const [orderTotals, paid, invoices] = await Promise.all([
    billableTotalsByOrder(businessId, orderIds),
    paidByOrder(businessId, orderIds),
    invoiceNumbersByOrder(businessId, orderIds),
  ]);

  const rows: ReportPublication[] = publications.map((p) => ({
    customerId: p.customer_id,
    customerLabel: p.customer.business_name,
    newspaperId: p.newspaper_id,
    orderId: p.order_id,
    price: Number(p.price),
    status: p.status,
  }));

  const orders: ReportOrder[] = orderIds.map((orderId) => ({
    orderId,
    paidAmount: paid.get(orderId) ?? 0,
    invoiceNumbers: invoices.get(orderId) ?? [],
  }));

  return buildReport(rows, orders, orderTotals);
}

/** Sum of each order's billable publications — the apportioning denominator. */
async function billableTotalsByOrder(
  businessId: string,
  orderIds: string[],
): Promise<Map<string, number>> {
  if (orderIds.length === 0) return new Map();
  const grouped = await tenantDb(businessId).publication.groupBy({
    by: ["order_id"],
    where: { order_id: { in: orderIds }, status: { notIn: NOT_BILLABLE } },
    _sum: { price: true },
  });
  return new Map(grouped.map((g) => [g.order_id, Number(g._sum.price ?? 0)]));
}

export type PublicationReportRow = Awaited<ReturnType<typeof publicationReport>>["rows"][number];

/**
 * The publication-level report (US-010 AC-2, AC-3).
 *
 * Every row is fetched and the lens filters in memory, so the four chips can
 * carry live counts. The 5000 ceiling is what keeps that honest: an MVP
 * newspaper does not produce more publications in a period than that, and a
 * business that does gets a truncated report rather than a slow one.
 */
export async function publicationReport(
  businessId: string,
  filters: ReportFilters & { lens?: PublicationLens },
) {
  const rows = await tenantDb(businessId).publication.findMany({
    where: {
      publication_date: dateWhere(filters.from, filters.to),
      ...(filters.newspaperId && filters.newspaperId !== "all"
        ? { newspaper_id: filters.newspaperId }
        : {}),
      ...(filters.customerId && filters.customerId !== "all"
        ? { customer_id: filters.customerId }
        : {}),
    },
    orderBy: [{ publication_date: "asc" }],
    select: {
      id: true,
      publication_date: true,
      status: true,
      placement_status: true,
      payment_status: true,
      price: true,
      advertisement_id: true,
      order_id: true,
      order: { select: { number: true } },
      customer: { select: { id: true, business_name: true } },
      newspaper: { select: { name: true } },
      ad_shape: { select: { name: true } },
    },
    take: 5000,
  });

  const shaped = rows.map((r) => ({
    id: r.id,
    date: r.publication_date,
    customerId: r.customer.id,
    customerLabel: r.customer.business_name,
    newspaper: r.newspaper.name,
    shape: r.ad_shape.name,
    status: r.status,
    placementStatus: r.placement_status,
    paymentStatus: r.payment_status as PaymentStatus,
    price: Number(r.price),
    hasAdvertisement: r.advertisement_id !== null,
    orderId: r.order_id,
    orderNumber: r.order.number,
  }));

  const lens = filters.lens ?? "all";
  return { rows: shaped.filter((r) => matchesLens(r, lens)), all: shaped };
}

/** KPI cards on the billing screen — the whole business, not the filtered table. */
export async function billingTotals(businessId: string) {
  const rows = await billingCustomers(businessId);
  return {
    billed: round2(rows.reduce((s, r) => s + r.billed, 0)),
    paid: round2(rows.reduce((s, r) => s + r.paid, 0)),
    outstanding: round2(rows.reduce((s, r) => s + r.outstanding, 0)),
    // Money the business is holding against nothing. Its own figure and not a
    // deduction from the debt: they are owed by, and held for, different people.
    credit: round2(rows.reduce((s, r) => s + r.credit, 0)),
    customersInDebt: rows.filter((r) => r.outstanding > 0).length,
    customersInCredit: rows.filter((r) => r.credit > 0).length,
    customerCount: rows.length,
  };
}

/** Total received across the business, for a card that has to say "so far". */
export async function livePaymentCount(businessId: string): Promise<number> {
  return tenantDb(businessId).payment.count({ where: { status: "recorded" } });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
