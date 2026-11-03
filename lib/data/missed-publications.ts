/**
 * Publications whose date has passed without them running (the user,
 * 03/11/2026: "המערכת צריכה לשים לב שעבר התאריך של העיתון והמודעה לא פורסמה
 * — אם לשים מודעה אחרת במקום בעיתון אחר או לזכות את הלקוח").
 *
 * "Missed" = the date is before today (Jerusalem) and the publication never got
 * onto a page: still waiting for a file, or ready and never placed. Something
 * placed in an issue nobody closed yet is NOT here — that is an unclosed
 * issue, and the issues screen already says so.
 *
 * Two ways out, both recorded in the audit log:
 * - move it to another date of the same newspaper;
 * - credit the customer: the publication is cancelled, and whatever the order
 *   is now overpaid by moves to the customer's credit (the user's answer).
 */
import { Prisma } from "@prisma/client";
import { jerusalemDay } from "@/lib/domain/calendar";
import { roundMoney as round2 } from "@/lib/domain/order";
import { basePrisma, tenantDb } from "./db";
import { recalcOrderPaymentStatus } from "./payments";
import { setPublicationStatus } from "./publications";
import { syncOrderCompletion } from "./orders";

const MISSED_STATES = ["missing_ad", "ad_received", "ready_for_layout"] as const;

function missedWhere(now: Date): Prisma.PublicationWhereInput {
  return {
    publication_date: { lt: jerusalemDay(now) },
    status: { in: [...MISSED_STATES] },
    // Inside AND: tenantDb merges its own filter onto relation keys.
    AND: [{ order: { status: { in: ["approved", "completed"] } } }],
  };
}

export async function missedPublications(businessId: string, now = new Date()) {
  return tenantDb(businessId).publication.findMany({
    where: missedWhere(now),
    orderBy: [{ publication_date: "asc" }],
    take: 200,
    select: {
      id: true,
      publication_date: true,
      price: true,
      status: true,
      newspaper: { select: { id: true, name: true, publication_days: true } },
      ad_shape: { select: { name: true } },
      customer: { select: { id: true, business_name: true } },
      order: { select: { id: true, number: true } },
    },
  });
}

export async function missedCount(businessId: string, now = new Date()) {
  return tenantDb(businessId).publication.count({ where: missedWhere(now) });
}

export class MissedError extends Error {}

/** To another date of the same newspaper — a date that has not passed. */
export async function moveMissedPublication(
  ctx: { businessId: string; userId: string },
  publicationId: string,
  newDate: Date,
  now = new Date(),
) {
  if (newDate < jerusalemDay(now)) throw new MissedError("התאריך החדש כבר עבר");
  return basePrisma.$transaction(async (tx) => {
    const pub = await tx.publication.findFirst({
      where: { id: publicationId, business_id: ctx.businessId, ...missedWhere(now) },
      select: { id: true, publication_date: true, order_item_id: true, newspaper_id: true },
    });
    if (!pub) throw new MissedError("הפרסום לא נמצא, או שכבר טופל");
    const closed = await tx.issue.findFirst({
      where: { newspaper_id: pub.newspaper_id, issue_date: newDate, status: "closed" },
      select: { id: true },
    });
    if (closed) throw new MissedError("הגיליון של התאריך הזה כבר נסגר");

    await tx.publication.update({ where: { id: pub.id }, data: { publication_date: newDate } });
    if (pub.order_item_id) {
      await tx.adOrderItem.update({
        where: { id: pub.order_item_id },
        data: { publication_date: newDate },
      });
    }
    await tx.auditLog.create({
      data: {
        business_id: ctx.businessId,
        user_id: ctx.userId,
        action: "move_missed_publication",
        target_type: "Publication",
        target_id: pub.id,
        old_value: { publication_date: pub.publication_date.toISOString().slice(0, 10) },
        new_value: { publication_date: newDate.toISOString().slice(0, 10) },
      },
    });
  });
}

/**
 * Cancel it, and move what the order is now overpaid by to the customer's
 * credit. Payments are always positive (rule 1), so "moving" is: detach whole
 * payment rows from the order while they fit, and split the last one.
 */
export async function creditMissedPublication(
  ctx: { businessId: string; userId: string },
  publicationId: string,
  now = new Date(),
): Promise<number> {
  return basePrisma.$transaction(async (tx) => {
    const pub = await tx.publication.findFirst({
      where: { id: publicationId, business_id: ctx.businessId, ...missedWhere(now) },
      select: { id: true, status: true, order_id: true, customer_id: true, price: true },
    });
    if (!pub) throw new MissedError("הפרסום לא נמצא, או שכבר טופל");

    await setPublicationStatus(tx, pub.id, "canceled");
    await syncOrderCompletion(tx, ctx.businessId, [pub.id]);

    const [payments, live] = await Promise.all([
      tx.payment.findMany({
        where: { order_id: pub.order_id, business_id: ctx.businessId, status: "recorded" },
        orderBy: { created_at: "desc" },
      }),
      tx.publication.findMany({
        where: {
          order_id: pub.order_id,
          business_id: ctx.businessId,
          status: { not: "canceled" },
        },
        select: { price: true },
      }),
    ]);
    const paid = round2(payments.reduce((s, p) => s + Number(p.amount), 0));
    const owed = round2(live.reduce((s, p) => s + Number(p.price), 0));
    let excess = round2(paid - owed);
    const credited = Math.max(0, excess);

    for (const payment of payments) {
      if (excess <= 0) break;
      const amount = Number(payment.amount);
      if (amount <= excess) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { order_id: null, updated_by_user_id: ctx.userId },
        });
        excess = round2(excess - amount);
      } else {
        await tx.payment.update({
          where: { id: payment.id },
          data: { amount: round2(amount - excess), updated_by_user_id: ctx.userId },
        });
        await tx.payment.create({
          data: {
            business_id: ctx.businessId,
            customer_id: payment.customer_id,
            order_id: null,
            updated_by_user_id: ctx.userId,
            amount: excess,
            payment_date: payment.payment_date,
            external_invoice_number: payment.external_invoice_number,
            group_id: payment.group_id,
          },
        });
        excess = 0;
      }
    }

    await recalcOrderPaymentStatus(tx, ctx.businessId, pub.order_id);
    await tx.auditLog.create({
      data: {
        business_id: ctx.businessId,
        user_id: ctx.userId,
        action: "credit_missed_publication",
        target_type: "Publication",
        target_id: pub.id,
        old_value: { status: pub.status },
        new_value: { status: "canceled", credited },
      },
    });
    return credited;
  });
}
