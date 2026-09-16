"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import * as data from "@/lib/data/payments";
import { validatePayment } from "@/lib/domain/payment";
import { allocatePayment, describeAllocation } from "@/lib/domain/payment-allocation";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/payment-status";
import { orderNumber } from "../orders/format";

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

const MONEY = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });

export async function recordPaymentAction(form: {
  customerId: string;
  orderId: string;
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
      return { ok: true, note: `אין חוב פתוח — ${MONEY.format(result.credit)} נזקפו ליתרת הלקוח` };
    }
    // One order settled, with change left over: say where the change went, or
    // the money looks like it vanished between the amount typed and the status.
    if (result && result.credit > 0) {
      return {
        ok: true,
        note: `${statusNote(result.status) ?? "נשמר"} · ${MONEY.format(result.credit)} נזקפו ליתרת הלקוח`,
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
): Promise<{ text: string }> {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing", "write");

  const amount = parseAmount(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return { text: "" };

  const open = await data.openOrdersOf(ctx.businessId, customerId);
  return { text: describeAllocation(allocatePayment(amount, open), orderNumber) };
}

export async function updatePaymentAction(
  paymentId: string,
  form: { orderId: string; amount: string; paymentDate: string; externalInvoiceNumber: string },
): Promise<PaymentActionState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing", "write");

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
      note: `${MONEY.format(result.applied)} מהיתרה שויכו להזמנה. ${statusNote(result.status) ?? ""}`.trim(),
    };
  } catch (e) {
    if (e instanceof data.PaymentNotFoundError) return { message: e.message };
    throw e;
  }
}
