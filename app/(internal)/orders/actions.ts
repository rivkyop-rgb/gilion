"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getTenantContext } from "@/lib/auth/tenant";
import { canWrite, requireAccess, type Role } from "@/lib/auth/rbac";
import { withAudit } from "@/lib/data/audit";
import { basePrisma } from "@/lib/data/db";
import * as data from "@/lib/data/orders";
import * as pubs from "@/lib/data/publications";
import {
  completionBlockedMessage,
  itemsEditable,
  transition,
  InvalidTransitionError,
  type OrderStatus,
} from "@/lib/domain/order-status";
import {
  transition as publicationTransition,
  InvalidPublicationTransitionError,
} from "@/lib/domain/publication-status";
import { validateForSubmission, validateLine, type OrderLineInput } from "@/lib/domain/order";

export type FormState = { errors?: Record<string, string>; message?: string; ok?: boolean };

/** Orders are a sales function: admin and sales only (stage 04 permissions). */
async function requireOrderWrite() {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "orders", "write");
  return ctx;
}

const lineSchema = z.object({
  newspaperId: z.string(),
  pageTypeId: z.string(),
  adShapeId: z.string(),
  publicationDate: z.string(),
  price: z.string(),
});

function readLine(formData: FormData): OrderLineInput | null {
  const parsed = lineSchema.safeParse({
    newspaperId: formData.get("newspaperId"),
    pageTypeId: formData.get("pageTypeId"),
    adShapeId: formData.get("adShapeId"),
    publicationDate: formData.get("publicationDate"),
    price: formData.get("price") ?? "",
  });
  if (!parsed.success) return null;

  const raw = parsed.data.price.trim();
  return {
    newspaperId: parsed.data.newspaperId,
    pageTypeId: parsed.data.pageTypeId,
    adShapeId: parsed.data.adShapeId,
    publicationDate: parsed.data.publicationDate,
    price: raw === "" ? null : Number(raw),
  };
}

export async function createOrderDraftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return { errors: { customerId: "יש לבחור לקוח" } };

  const order = await data.createOrderDraft(ctx.businessId, customerId);
  revalidatePath("/orders");
  redirect(`/orders/${order.id}`);
}

export async function addOrderItemAction(
  orderId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };
  if (!itemsEditable(order.status as OrderStatus)) {
    return { message: "לא ניתן לערוך שורות בהזמנה במצב הזה" };
  }

  const line = readLine(formData);
  if (!line) return { message: "הטופס לא נשלח כראוי" };

  // An empty price falls back to the price list before it is called an error —
  // rule 4. Only when the matrix cell is empty too does the user have to type.
  if (line.price === null) {
    line.price = await data.priceSuggestion(
      ctx.businessId,
      line.newspaperId,
      line.pageTypeId,
      line.adShapeId,
    );
  }

  const errors = validateLine(line, 0);
  if (errors.length) {
    return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };
  }

  const created = await data.addOrderItem(ctx.businessId, orderId, {
    newspaper_id: line.newspaperId,
    page_type_id: line.pageTypeId,
    ad_shape_id: line.adShapeId,
    publication_date: new Date(line.publicationDate),
    price: line.price!,
  });
  if (!created) return { message: "ההזמנה לא נמצאה" };

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function removeOrderItemAction(orderId: string, itemId: string): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };
  if (!itemsEditable(order.status as OrderStatus)) {
    return { message: "לא ניתן לערוך שורות בהזמנה במצב הזה" };
  }

  await data.removeOrderItem(ctx.businessId, itemId);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function submitOrderAction(orderId: string): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };

  const errors = validateForSubmission({
    customerId: order.customer_id,
    lines: order.items.map((i) => ({
      newspaperId: i.newspaper_id,
      pageTypeId: i.page_type_id,
      adShapeId: i.ad_shape_id,
      publicationDate: i.publication_date.toISOString().slice(0, 10),
      price: Number(i.price),
    })),
  });
  if (errors.length) return { message: errors[0]!.message };

  try {
    const next = transition(order.status as OrderStatus, "SUBMIT");
    await basePrisma.adOrder.update({ where: { id: orderId }, data: { status: next } });
  } catch (e) {
    if (e instanceof InvalidTransitionError) return { message: e.message };
    throw e;
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/**
 * The central action of this stage (US-004).
 *
 * One transaction: the status change, one Publication per line with its price
 * copied and frozen, and the audit row. If any part fails nothing survives —
 * an order that says "approved" with no publications behind it would be worse
 * than a failed click.
 */
export async function approveOrderAction(orderId: string): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };
  if (order.items.length === 0) return { message: "לא ניתן לאשר הזמנה בלי שורות" };

  let next: OrderStatus;
  try {
    next = transition(order.status as OrderStatus, "APPROVE");
  } catch (e) {
    if (e instanceof InvalidTransitionError) return { message: e.message };
    throw e;
  }

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "approve_order", targetType: "AdOrder", targetId: orderId },
    async (tx) => {
      const updated = await tx.adOrder.update({
        where: { id: orderId },
        data: { status: next, approved_at: new Date() },
      });

      const created = await data.createPublicationsForOrder(
        tx,
        {
          id: order.id,
          business_id: order.business_id,
          customer_id: order.customer_id,
          source: order.source,
        },
        order.items,
      );

      return {
        old: { status: order.status },
        new: { status: updated.status, publicationsCreated: created },
      };
    },
  );

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/publications");
  return { ok: true };
}

export async function rejectOrderAction(
  orderId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };

  // FR-19: the reason is optional. An empty box must still reject.
  const reason = String(formData.get("reason") ?? "").trim() || null;

  let next: OrderStatus;
  try {
    next = transition(order.status as OrderStatus, "REJECT");
  } catch (e) {
    if (e instanceof InvalidTransitionError) return { message: e.message };
    throw e;
  }

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "reject_order", targetType: "AdOrder", targetId: orderId },
    async (tx) => {
      await tx.adOrder.update({
        where: { id: orderId },
        data: { status: next, rejection_reason: reason },
      });
      return { old: { status: order.status }, new: { status: next, rejection_reason: reason } };
    },
  );

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

export async function cancelOrderAction(orderId: string): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };

  try {
    const next = transition(order.status as OrderStatus, "CANCEL");
    await basePrisma.adOrder.update({ where: { id: orderId }, data: { status: next } });
  } catch (e) {
    if (e instanceof InvalidTransitionError) return { message: e.message };
    throw e;
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/** Completion is an accounting act, not a sales one (stage 04 permissions). */
export async function completeOrderAction(orderId: string): Promise<FormState> {
  const ctx = await getTenantContext();
  if (!(ctx.role === "admin" || ctx.role === "accounting")) {
    return { message: "רק מנהל או הנהלת חשבונות יכולים לסמן הזמנה כהושלמה" };
  }

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };

  // Rule 9: every publication must have run or been cancelled first.
  const statuses = await pubs.publicationStatusesForOrder(ctx.businessId, orderId);
  const blocked = completionBlockedMessage(statuses);
  if (blocked) return { message: blocked };

  try {
    const next = transition(order.status as OrderStatus, "COMPLETE");
    await basePrisma.adOrder.update({
      where: { id: orderId },
      data: { status: next, completed_at: new Date() },
    });
  } catch (e) {
    if (e instanceof InvalidTransitionError) return { message: e.message };
    throw e;
  }

  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/**
 * Cancelling a single publication (rule 18). Stage 06 will extend this to drop
 * the placement in the same transaction; the audit wrapper is already here so
 * that extension has nowhere else to go.
 */
export async function cancelPublicationAction(publicationId: string): Promise<FormState> {
  const ctx = await getTenantContext();
  if (!canWrite(ctx.role as Role, "orders")) {
    return { message: "אין לך הרשאה לבטל פרסום" };
  }

  const publication = await pubs.getPublication(ctx.businessId, publicationId);
  if (!publication) return { message: "הפרסום לא נמצא" };

  try {
    publicationTransition(publication.status, "CANCELED");
  } catch (e) {
    if (e instanceof InvalidPublicationTransitionError) {
      return { message: "לא ניתן לבטל פרסום שכבר פורסם" };
    }
    throw e;
  }

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "cancel_publication", targetType: "Publication", targetId: publicationId },
    async (tx) => {
      await pubs.setPublicationStatus(tx, publicationId, "canceled");
      return { old: { status: publication.status }, new: { status: "canceled" } };
    },
  );

  revalidatePath("/publications");
  revalidatePath(`/orders/${publication.order_id}`);
  return { ok: true };
}

/** Reads the base price for the builder's live suggestion. */
export async function priceSuggestionAction(
  newspaperId: string,
  pageTypeId: string,
  adShapeId: string,
): Promise<number | null> {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "orders");
  return data.priceSuggestion(ctx.businessId, newspaperId, pageTypeId, adShapeId);
}
