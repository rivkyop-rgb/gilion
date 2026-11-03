"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  describePosition,
  parsePosition,
  positionColumns,
  type PositionInput,
} from "@/lib/domain/position-request";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { recordAction, withAudit } from "@/lib/data/audit";
import * as data from "@/lib/data/orders";
import * as pubs from "@/lib/data/publications";
import {
  itemsEditable,
  orderDeletionBlocked,
  transition,
  InvalidTransitionError,
  type OrderStatus,
} from "@/lib/domain/order-status";
import { isPublicationDay } from "@/lib/domain/publication-days";
import { noPaperReason } from "@/lib/domain/jewish-calendar";
import {
  transition as publicationTransition,
  InvalidPublicationTransitionError,
} from "@/lib/domain/publication-status";
import { validateForSubmission, validateLine, type OrderLineInput } from "@/lib/domain/order";

export type FormState = { errors?: Record<string, string>; message?: string; ok?: boolean };

/** Orders are a sales function: admin and sales only (stage 04 permissions). */
async function requireOrderWrite() {
  const ctx = await getTenantContext();
  requireArea(ctx, "orders", "write");
  return ctx;
}

/**
 * One combination, many dates: the picker submits `dates` once per ticked day.
 * `publicationDate` is still accepted for a single date so that a plain form
 * post (no JavaScript) keeps working.
 */
const lineSchema = z.object({
  newspaperId: z.string().min(1),
  pageTypeId: z.string().min(1),
  adShapeId: z.string().min(1),
  dates: z.array(z.string()).min(1, "יש לבחור לפחות תאריך אחד"),
  price: z.string(),
  offSchedule: z.boolean(),
});

type LineBatch = {
  base: Omit<OrderLineInput, "publicationDate">;
  dates: string[];
  offSchedule: boolean;
  position: PositionInput;
};

function readLines(formData: FormData): LineBatch | null {
  const submitted = formData.getAll("dates").map(String).filter(Boolean);
  const single = String(formData.get("publicationDate") ?? "").trim();
  const dates = [...new Set(submitted.length > 0 ? submitted : single ? [single] : [])].sort();

  const parsed = lineSchema.safeParse({
    newspaperId: formData.get("newspaperId"),
    pageTypeId: formData.get("pageTypeId"),
    adShapeId: formData.get("adShapeId"),
    dates,
    price: formData.get("price") ?? "",
    offSchedule: Boolean(formData.get("offSchedule")),
  });
  if (!parsed.success) return null;

  const raw = parsed.data.price.trim();
  return {
    base: {
      newspaperId: parsed.data.newspaperId,
      pageTypeId: parsed.data.pageTypeId,
      adShapeId: parsed.data.adShapeId,
      price: raw === "" ? null : Number(raw),
    },
    dates: parsed.data.dates,
    offSchedule: parsed.data.offSchedule,
    position: readPosition(formData),
  };
}

function readPosition(formData: FormData): PositionInput {
  const text = (name: string) => String(formData.get(name) ?? "");
  return {
    kind: text("positionKind"),
    page: text("requestedPage"),
    flex: text("positionFlex"),
    flexUnit: text("positionFlexUnit"),
    note: text("positionNote"),
  };
}

/**
 * Changes where ONE date of an order asks to be (the user, 03/11/2026: the
 * position "can change from publication to publication, not only per order").
 * Allowed until that date's issue has it on a page; after that the board is
 * where it moves.
 */
export async function updateItemPositionAction(
  orderId: string,
  itemId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrderWrite();
  const position = parsePosition(readPosition(formData));
  if (!position.ok) return { errors: { [position.field]: position.message } };
  const result = await data.updateItemPosition(ctx.businessId, orderId, itemId, position.value);
  if (result === "not_found") return { message: "השורה לא נמצאה" };
  if (result === "placed") {
    return { message: "הפרסום כבר משובץ בגיליון — אפשר להזיז אותו בלוח השיבוץ" };
  }
  await recordAction(
    ctx,
    { action: "update_order_lines", targetType: "AdOrder", targetId: orderId },
    { position: describePosition(position.value) ?? "ללא" },
  );
  revalidatePath(`/orders/${orderId}`);
  return { ok: true, message: "המיקום נשמר" };
}

export async function createOrderDraftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const customerId = String(formData.get("customerId") ?? "");
  if (!customerId) return { errors: { customerId: "יש לבחור לקוח" } };

  const order = await data.createOrderDraft(ctx.businessId, customerId);
  await recordAction(ctx, { action: "create_order", targetType: "AdOrder", targetId: order.id });
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

  const batch = readLines(formData);
  // "No dates" is the one failure a user can actually cause here, so it gets
  // its own message instead of the generic "the form was not submitted
  // properly", which tells them nothing they can act on.
  if (!batch) {
    const anyDate =
      formData.getAll("dates").some(Boolean) ||
      String(formData.get("publicationDate") ?? "").trim();
    return { message: anyDate ? "הטופס לא נשלח כראוי" : "יש לבחור לפחות תאריך פרסום אחד" };
  }

  // An empty price falls back to the price list before it is called an error —
  // rule 4. Only when the matrix cell is empty too does the user have to type.
  let price = batch.base.price;
  if (price === null) {
    price = await data.priceSuggestion(
      ctx.businessId,
      batch.base.newspaperId,
      batch.base.pageTypeId,
      batch.base.adShapeId,
    );
  }

  // Every date is validated before ANY row is written: a batch that half
  // succeeds would leave the user reading a total that includes lines they
  // were also being told are invalid.
  for (const [i, publicationDate] of batch.dates.entries()) {
    const errors = validateLine({ ...batch.base, price, publicationDate }, i);
    if (errors.length) {
      return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };
    }
  }

  // A chag is refused outright, before the print schedule is even consulted.
  // Unlike a weekday the paper skips, this is not a business decision that a
  // "special edition" tick can override — no issue is printed that day at all,
  // so an order for it could never be fulfilled.
  const onChag = batch.dates
    .map((d) => ({ date: d, reason: noPaperReason(d) }))
    .filter((x) => x.reason !== null);
  if (onChag.length > 0) {
    return { message: `${onChag[0]!.date}: ${onChag[0]!.reason}` };
  }

  // The print schedule is checked on the server too. The client disables the
  // button until the box is ticked, but the box is a client-side claim, and
  // "not a print day" must not become true just because the form was replayed.
  const schedule = await data.newspaperPublicationDays(ctx.businessId, batch.base.newspaperId);
  if (schedule === null) return { message: "העיתון לא נמצא" };

  const offSchedule = batch.dates.filter((d) => !isPublicationDay(schedule, d));
  if (offSchedule.length > 0 && !batch.offSchedule) {
    return {
      message: `${offSchedule.join(", ")} אינם ימי הדפסה של העיתון. יש לאשר שמדובר במהדורה מיוחדת.`,
    };
  }

  // Where in the issue these lines ask to be (31/10 and 03/11/2026).
  const position = parsePosition(batch.position);
  if (!position.ok) return { errors: { [position.field]: position.message } };

  const created = await data.addOrderItems(
    ctx.businessId,
    orderId,
    batch.dates.map((publicationDate) => ({
      newspaper_id: batch.base.newspaperId,
      page_type_id: batch.base.pageTypeId,
      ad_shape_id: batch.base.adShapeId,
      publication_date: new Date(publicationDate),
      price: price!,
      off_schedule: !isPublicationDay(schedule, publicationDate),
      ...positionColumns(position.value),
    })),
  );
  if (!created) return { message: "ההזמנה לא נמצאה" };

  await recordAction(
    ctx,
    { action: "update_order_lines", targetType: "AdOrder", targetId: orderId },
    { added: batch.dates.length },
  );
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/**
 * Deletes an order outright (as opposed to cancelling it).
 *
 * Guarded by `orderDeletionBlocked`, which refuses anything that has already
 * produced publications — see the note there. The check is re-read from the
 * database inside this action rather than trusted from the page that rendered
 * the button, because the order may have been approved in another tab since.
 */
export async function deleteOrderAction(orderId: string): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };

  const blocked = orderDeletionBlocked(order.status as OrderStatus, order._count.publications);
  if (blocked) return { message: blocked };

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "delete_order", targetType: "AdOrder", targetId: orderId },
    async (tx) => {
      // The audit row is the only thing that survives, so it carries enough to
      // answer "what was deleted" without the order itself.
      const snapshot = {
        status: order.status,
        customer_id: order.customer_id,
        total_price: Number(order.total_price),
        items: order.items.length,
      };
      // Items cascade from the order — see the relation in schema.prisma.
      await tx.adOrder.delete({ where: { id: orderId } });
      return { old: snapshot, new: null };
    },
  );

  revalidatePath("/orders");
  redirect("/orders");
}

export async function removeOrderItemAction(orderId: string, itemId: string): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };
  if (!itemsEditable(order.status as OrderStatus)) {
    return { message: "לא ניתן לערוך שורות בהזמנה במצב הזה" };
  }

  await data.removeOrderItem(ctx.businessId, itemId);
  await recordAction(
    ctx,
    { action: "update_order_lines", targetType: "AdOrder", targetId: orderId },
    { removed: 1 },
  );
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/**
 * Changes one line's date and price, from the preview table (12/10/2026).
 *
 * Newspaper, page type and shape are not edited here: they decide the price
 * and what the line even is, and changing them is a delete and an add. The
 * date goes through the same three checks a new line does — chag refused,
 * off-schedule only when confirmed, and the price rule.
 */
export async function updateOrderItemAction(
  orderId: string,
  itemId: string,
  input: { date: string; price: string; specialEdition: boolean },
): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const parsed = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין"),
      price: z
        .string()
        .trim()
        .min(1, "יש להזין מחיר")
        .transform(Number)
        .pipe(z.number({ error: "מחיר לא תקין" }).finite().min(0, "המחיר לא יכול להיות שלילי")),
      specialEdition: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "הטופס לא תקין" };

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };
  if (!itemsEditable(order.status as OrderStatus)) {
    return { message: "לא ניתן לערוך שורות בהזמנה במצב הזה" };
  }
  const item = order.items.find((i) => i.id === itemId);
  if (!item) return { message: "השורה לא נמצאה בהזמנה הזאת" };

  const chag = noPaperReason(parsed.data.date);
  if (chag) return { message: `${parsed.data.date}: ${chag}` };

  const schedule = await data.newspaperPublicationDays(ctx.businessId, item.newspaper_id);
  if (schedule === null) return { message: "העיתון לא נמצא" };
  const offSchedule = !isPublicationDay(schedule, parsed.data.date);
  // A line already ordered as a special edition keeps that choice while its
  // date stays put — re-asking about a decision nobody is changing is noise.
  const sameDate = item.publication_date.toISOString().slice(0, 10) === parsed.data.date;
  if (offSchedule && !parsed.data.specialEdition && !(sameDate && item.off_schedule)) {
    return {
      message: "התאריך אינו יום הדפסה של העיתון. יש לאשר שמדובר במהדורה מיוחדת.",
      errors: { specialEdition: "offSchedule" },
    };
  }

  await data.updateOrderItem(ctx.businessId, itemId, {
    publication_date: new Date(parsed.data.date),
    price: parsed.data.price,
    off_schedule: offSchedule,
  });
  await recordAction(
    ctx,
    { action: "update_order_lines", targetType: "AdOrder", targetId: orderId },
    { edited: 1 },
  );
  revalidatePath(`/orders/${orderId}`);
  return { ok: true };
}

/** The checks a draft must pass to leave draft — by submission or by direct approval. */
function submissionProblem(order: NonNullable<Awaited<ReturnType<typeof data.getOrder>>>) {
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
  return errors.length ? errors[0]!.message : null;
}

export async function submitOrderAction(orderId: string): Promise<FormState> {
  const ctx = await requireOrderWrite();

  const order = await data.getOrder(ctx.businessId, orderId);
  if (!order) return { message: "ההזמנה לא נמצאה" };

  const invalid = submissionProblem(order);
  if (invalid) return { message: invalid };

  try {
    const next = transition(order.status as OrderStatus, "SUBMIT");
    await data.setOrderStatus(ctx.businessId, orderId, next);
  } catch (e) {
    if (e instanceof InvalidTransitionError) return { message: e.message };
    throw e;
  }

  await recordAction(ctx, { action: "submit_order", targetType: "AdOrder", targetId: orderId });
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
    const current = order.status as OrderStatus;
    if (current === "draft") {
      // Straight from the draft only where the business chose it
      // (Business.internal_orders_need_approval), and never for a portal
      // request — nobody in the office has looked at one of those yet.
      if (order.source !== "internal" || (await data.internalOrdersNeedApproval(ctx.businessId))) {
        return { message: 'בעסק הזה הזמנה נשלחת לאישור קודם — לחצי "שליחה לאישור"' };
      }
      const invalid = submissionProblem(order);
      if (invalid) return { message: invalid };
      // Both edges of the machine, so the direct path is not a back door
      // around it: a draft that could not be submitted cannot be approved.
      next = transition(transition(current, "SUBMIT"), "APPROVE");
    } else {
      next = transition(current, "APPROVE");
    }
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

      // The quantity discount is resolved once, here, and written onto the
      // lines before anything is copied off them (backlog item 12). From this
      // moment the order owes nothing to the package table.
      const frozen = await data.freezeDiscounts(tx, ctx.businessId, order.items);
      await tx.adOrder.update({
        where: { id: orderId },
        data: { total_price: frozen.pricing.total },
      });

      const created = await data.createPublicationsForOrder(
        tx,
        {
          id: order.id,
          business_id: order.business_id,
          customer_id: order.customer_id,
          source: order.source,
          advertisement_id: order.advertisement_id,
        },
        frozen.items,
      );

      return {
        old: { status: order.status },
        new: {
          status: updated.status,
          publicationsCreated: created,
          total: frozen.pricing.total,
          discount: frozen.pricing.discount,
        },
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
    await data.setOrderStatus(ctx.businessId, orderId, next);
  } catch (e) {
    if (e instanceof InvalidTransitionError) return { message: e.message };
    throw e;
  }

  await recordAction(ctx, { action: "cancel_order", targetType: "AdOrder", targetId: orderId });
  revalidatePath("/orders");
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
  if (!canWriteArea(ctx, "orders")) {
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
      // Cancelling the last one still in flight completes the order.
      await data.syncOrderCompletion(tx, ctx.businessId, [publicationId]);
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
  requireArea(ctx, "orders");
  return data.priceSuggestion(ctx.businessId, newspaperId, pageTypeId, adShapeId);
}
