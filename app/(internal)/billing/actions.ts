"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import * as data from "@/lib/data/payments";
import { creditState } from "@/lib/data/credit-block";
import { withAudit } from "@/lib/data/audit";
import { validatePayment } from "@/lib/domain/payment";
import { allocatePayment, describeAllocation } from "@/lib/domain/payment-allocation";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/payment-status";
import { orderNumber } from "../orders/format";
import { getOrder } from "@/lib/data/orders";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/domain/order-status";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { formatDate, formatMoney } from "@/lib/domain/format";

export type PaymentActionState = {
  message?: string;
  ok?: boolean;
  /** What the order's status became — the screen reports the DERIVED answer. */
  note?: string;
};

/**
 * The shape the server will accept, regardless of what the form sent.
 *
 * `amount` arrives as a string from an `<input>`; coercing here rather than in
 * the component is the point of conventions.md §9 — client validation is UX,
 * and this is the copy that decides.
 */
const paymentSchema = z.object({
  customerId: z.string().min(1),
  orderId: z.string(),
  amount: z.string(),
  paymentDate: z.string(),
  externalInvoiceNumber: z.string(),
});

function parseAmount(raw: string): number {
  // A person typing money uses commas and may type a currency sign; neither is
  // a reason to refuse the number they clearly meant.
  return Number(raw.replace(/[,\s₪]/g, ""));
}

function refreshed() {
  revalidatePath("/billing");
  revalidatePath("/reports");
  revalidatePath("/customers", "layout");
  revalidatePath("/orders", "layout");
  revalidatePath("/publications");
  revalidatePath("/dashboard");
}

function statusNote(status: PaymentStatus | null | undefined): string | undefined {
  return status ? `סטטוס ההזמנה: ${PAYMENT_STATUS_LABELS[status]}` : undefined;
}

export async function recordPaymentAction(form: {
  customerId: string;
  orderId: string;
  /** Invoices ticked in the form; the split stays inside them. */
  orderIds?: string[];
  amount: string;
  paymentDate: string;
  externalInvoiceNumber: string;
}): Promise<PaymentActionState> {
  const ctx = await getTenantContext();
  // FR-8: billing is closed to designer and sales entirely, and `write` is what
  // recording money requires.
  requireArea(ctx, "billing", "write");

  const parsed = paymentSchema.safeParse(form);
  if (!parsed.success) return { message: "הטופס חסר פרטים" };

  const amount = parseAmount(parsed.data.amount);
  const error = validatePayment({
    amount,
    paymentDate: parsed.data.paymentDate,
    externalInvoiceNumber: parsed.data.externalInvoiceNumber,
  });
  if (error) return { message: error };

  try {
    const result = await data.recordPayment(
      { businessId: ctx.businessId, userId: ctx.userId },
      {
        customerId: parsed.data.customerId,
        orderId: parsed.data.orderId || null,
        orderIds: (form.orderIds ?? []).filter((id) => typeof id === "string" && id).slice(0, 200),
        amount,
        paymentDate: parsed.data.paymentDate,
        externalInvoiceNumber: parsed.data.externalInvoiceNumber.trim(),
      },
    );
    refreshed();

    // A split has to REPORT where the money went, not merely that it saved.
    // The person typed one number; four orders moved, and the confirmation is
    // the only place that says which.
    if (result && result.allocations.length > 1) {
      return {
        ok: true,
        note: describeAllocation(
          { allocations: result.allocations, leftover: result.credit },
          orderNumber,
        ),
      };
    }
    if (result && result.allocations.length === 0) {
      return { ok: true, note: `אין חוב פתוח — ${formatMoney(result.credit)} נזקפו ליתרת הלקוח` };
    }
    // One order settled, with change left over: say where the change went, or
    // the money looks like it vanished between the amount typed and the status.
    if (result && result.credit > 0) {
      return {
        ok: true,
        note: `${statusNote(result.status) ?? "נשמר"} · ${formatMoney(result.credit)} נזקפו ליתרת הלקוח`,
      };
    }
    return { ok: true, note: statusNote(result?.status) };
  } catch (e) {
    if (e instanceof data.PaymentNotFoundError) return { message: e.message };
    throw e;
  }
}

/**
 * What a split WOULD do, without doing it.
 *
 * The form calls this as the amount is typed, so the sentence under the field
 * says where the money is about to go before anybody commits to it. Reading it
 * afterwards is too late: undoing a split means cancelling several records.
 *
 * It reads the open orders fresh rather than trusting what the page was
 * rendered with — another payment may have landed since — which is also why
 * the preview is advisory and the server allocates again for real on save.
 */
export async function previewAllocationAction(
  customerId: string,
  rawAmount: string,
  orderIds: string[] = [],
): Promise<{ text: string }> {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing", "write");

  const amount = parseAmount(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return { text: "" };

  const ticked = new Set(orderIds);
  const open = (await data.openOrdersOf(ctx.businessId, customerId)).filter(
    (o) => ticked.size === 0 || ticked.has(o.orderId),
  );
  const result = allocatePayment(amount, open);
  const head = describeAllocation(result, orderNumber);
  // 08/11/2026: and which weeks it closes — printed first — so the person
  // typing sees that the week that already ran is the one being paid.
  const covered = await Promise.all(
    result.allocations.map(async (a) => {
      const weeks = await data.coverageOf(ctx.businessId, a.orderId, a.amount);
      if (weeks.length === 0) return "";
      const shown = weeks
        .slice(0, 3)
        .map((w) =>
          w.openAfter > 0
            ? `${formatDate(w.date)} (${formatMoney(w.added)} מתוך ${formatMoney(w.price)})`
            : formatDate(w.date),
        );
      const more = weeks.length > 3 ? ` ועוד ${weeks.length - 3}` : "";
      return `${result.allocations.length > 1 ? `${orderNumber(a.number)}: ` : ""}יכסה את ${shown.join(", ")}${more}`;
    }),
  );
  const tail = covered.filter(Boolean).join(" · ");
  return { text: tail ? `${head}. ${tail}` : head };
}

/**
 * Changing or cancelling a payment that is already on the books is a
 * manager's call (08/11/2026: "עריכה או ביטול רישומי תשלום — רק מנהל").
 * Recording a new one stays with whoever may write to billing.
 */
const AMEND_REFUSED = "רק מנהל יכול לערוך או לבטל רישום תשלום";
function mayAmend(ctx: { role: string; isSuperAdmin: boolean }) {
  return ctx.role === "admin" || ctx.isSuperAdmin;
}

export async function updatePaymentAction(
  paymentId: string,
  form: { orderId: string; amount: string; paymentDate: string; externalInvoiceNumber: string },
): Promise<PaymentActionState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing", "write");
  if (!mayAmend(ctx)) return { message: AMEND_REFUSED };

  const parsed = paymentSchema.omit({ customerId: true }).safeParse(form);
  if (!parsed.success) return { message: "הטופס חסר פרטים" };

  const amount = parseAmount(parsed.data.amount);
  const error = validatePayment({
    amount,
    paymentDate: parsed.data.paymentDate,
    externalInvoiceNumber: parsed.data.externalInvoiceNumber,
  });
  if (error) return { message: error };

  try {
    const result = await data.updatePayment(
      { businessId: ctx.businessId, userId: ctx.userId },
      paymentId,
      {
        orderId: parsed.data.orderId || null,
        amount,
        paymentDate: parsed.data.paymentDate,
        externalInvoiceNumber: parsed.data.externalInvoiceNumber.trim(),
      },
    );
    refreshed();
    return { ok: true, note: statusNote(result?.status) };
  } catch (e) {
    if (e instanceof data.PaymentNotFoundError) return { message: e.message };
    throw e;
  }
}

/**
 * Cancels a record, or puts a cancelled one back.
 *
 * Reversible on purpose: cancelling is how a typo is corrected, and a mistake
 * made while correcting a mistake should not need a developer. Both directions
 * are audited, so the trail shows the whole argument.
 */
export async function cancelPaymentAction(paymentId: string): Promise<PaymentActionState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing", "write");
  if (!mayAmend(ctx)) return { message: AMEND_REFUSED };

  if (!paymentId) return { message: "לא נבחר רישום" };

  try {
    const result = await data.cancelPayment(
      { businessId: ctx.businessId, userId: ctx.userId },
      paymentId,
    );
    refreshed();
    return {
      ok: true,
      note:
        result?.status === "canceled"
          ? result.affected > 1
            ? `התשלום בוטל על כל ${result.affected} ההזמנות שהוא נפרס עליהן`
            : "הרישום בוטל ואינו נספר"
          : result && result.affected > 1
            ? `התשלום הוחזר לחישוב על כל ${result.affected} ההזמנות`
            : "הרישום הוחזר לחישוב",
    };
  } catch (e) {
    if (e instanceof data.PaymentNotFoundError) return { message: e.message };
    throw e;
  }
}

/**
 * Puts a customer's credit onto one order.
 *
 * The decision she asked for at the moment it matters: a customer with ₪300
 * left over from a previous payment buys again, and somebody has to say
 * whether that money settles the new order or stays in the general balance.
 * Neither answer is right in general, so neither happens on its own — the
 * order screen asks, and this is the "yes".
 *
 * Follows the BILLING permission and not the orders one: it moves money.
 */
export async function applyCreditAction(orderId: string): Promise<PaymentActionState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing", "write");

  if (!orderId) return { message: "לא נבחרה הזמנה" };

  try {
    const result = await data.applyCreditToOrder(
      { businessId: ctx.businessId, userId: ctx.userId },
      orderId,
    );
    refreshed();
    if (!result || result.applied <= 0) return { ok: true, note: "אין יתרה לשייך" };
    return {
      ok: true,
      note: `${formatMoney(result.applied)} מהיתרה שויכו להזמנה. ${statusNote(result.status) ?? ""}`.trim(),
    };
  } catch (e) {
    if (e instanceof data.PaymentNotFoundError) return { message: e.message };
    throw e;
  }
}

export type OrderPeek = {
  id: string;
  label: string;
  customer: string;
  status: string;
  createdAt: string;
  total: number;
  paid: number;
  publications: Array<{
    id: string;
    date: string;
    newspaper: string;
    shape: string;
    pageType: string | null;
    status: string;
    hasAd: boolean;
    price: number | null;
  }>;
};

/**
 * The order a payment is attached to, read-only, for the "eye" in the payment
 * dialog (08/11/2026). The habodek run wanted to check WHICH order a payment
 * went to without leaving the dialog it was typing in — opening the order
 * screen lost the half-filled form.
 */
export async function orderPeekAction(orderId: string): Promise<OrderPeek | null> {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing");
  const id = z.string().min(1).max(64).safeParse(orderId);
  if (!id.success) return null;

  const order = await getOrder(ctx.businessId, id.data);
  if (!order) return null;
  const paid = (await data.paidByOrder(ctx.businessId, [order.id])).get(order.id) ?? 0;

  return {
    id: order.id,
    label: orderNumber(order.number),
    customer: order.customer.business_name,
    status: ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status,
    createdAt: formatDate(order.created_at),
    total: Number(order.total_price),
    paid,
    publications: order.publications.map((p) => ({
      id: p.id,
      date: formatDate(p.publication_date),
      newspaper: p.newspaper.name,
      shape: p.ad_shape?.name ?? "",
      pageType: p.order_item?.page_type?.name ?? null,
      status: PUBLICATION_STATUS_LABELS[p.status as PublicationStatus] ?? p.status,
      hasAd: Boolean(p.advertisement),
      price: p.price == null ? null : Number(p.price),
    })),
  };
}

/**
 * A manager lets a blocked customer place ONE more order (08/11/2026: "עד
 * שמנהל מאשר ומוריד את החסימה — כל הורדת חסימה היא חד פעמית"). The release
 * waits until the next order spends it; a second order needs a second one.
 */
export async function releaseCreditBlockAction(customerId: string): Promise<{ message?: string }> {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing");
  if (ctx.role !== "admin" && !ctx.isSuperAdmin) return { message: "רק מנהל יכול לשחרר חסימה" };
  const parsed = z.string().min(1).safeParse(customerId);
  if (!parsed.success) return { message: "הלקוח לא נמצא" };

  const state = await creditState(ctx.businessId, parsed.data);
  if (!state.blocked) return { message: "הלקוח לא חסום כרגע" };
  if (state.releaseWaiting) return { message: "כבר יש שחרור שמחכה להזמנה הבאה" };

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "release_credit_block", targetType: "Customer", targetId: parsed.data },
    async (tx) => {
      const release = await tx.creditRelease.create({
        data: { business_id: ctx.businessId, customer_id: parsed.data, granted_by: ctx.userId },
        select: { id: true },
      });
      return { old: null, new: { release_id: release.id, reason: state.reason } };
    },
  );
  revalidatePath(`/customers/${parsed.data}`);
  revalidatePath(`/billing/customers/${parsed.data}`);
  return {};
}
