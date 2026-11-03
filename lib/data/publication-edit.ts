/**
 * Changing the SIZE of one publication from the placement board (the user,
 * 03/11/2026: "לערוך את ההזמנה מעמוד שיבוץ — מיקום / גודל / קובץ"), with the
 * price following the price list — her answer when asked.
 *
 * The line keeps the LIST price and the publication the net one, as approval
 * writes them (AdOrderItem.price vs Publication.price): the line's own frozen
 * discount is applied to the new list price. `AdOrder.total_price` stays the
 * record of approval; every money screen sums the live publications, so the
 * customer's balance moves with this — and the order's payment status is
 * re-derived in the same transaction.
 *
 * Only before the ad is on a page: a different size on a page is a different
 * rectangle, and that is the board's to decide by placing it again.
 */
import { roundMoney } from "@/lib/domain/order";
import { basePrisma } from "./db";
import { recalcOrderPaymentStatus } from "./payments";

export class PublicationEditError extends Error {}

export async function changePublicationShape(
  ctx: { businessId: string; userId: string },
  publicationId: string,
  shapeId: string,
): Promise<{ from: number; to: number }> {
  return basePrisma.$transaction(async (tx) => {
    const pub = await tx.publication.findFirst({
      where: { id: publicationId, business_id: ctx.businessId },
      select: {
        id: true,
        order_id: true,
        order_item_id: true,
        newspaper_id: true,
        ad_shape_id: true,
        price: true,
        discount_percent: true,
        status: true,
        placement_status: true,
        order_item: { select: { page_type_id: true, price: true } },
      },
    });
    if (!pub) throw new PublicationEditError("הפרסום לא נמצא");
    if (pub.status === "published" || pub.status === "canceled") {
      throw new PublicationEditError("אי אפשר לשנות גודל לפרסום שפורסם או בוטל");
    }
    if (pub.placement_status !== "not_placed") {
      throw new PublicationEditError("הפרסום כבר על עמוד — יש להוריד אותו מהעמוד ואז לשנות גודל");
    }
    if (!pub.order_item) throw new PublicationEditError("לפרסום הזה אין שורת הזמנה לשנות");
    if (pub.ad_shape_id === shapeId) return { from: Number(pub.price), to: Number(pub.price) };

    const allowed = await tx.allowedAdShape.findFirst({
      where: { page_type_id: pub.order_item.page_type_id, ad_shape_id: shapeId },
      select: { id: true },
    });
    if (!allowed) throw new PublicationEditError("הגודל הזה אינו מותר בסוג העמוד שנמכר");

    const rule = await tx.priceRule.findFirst({
      where: {
        newspaper_id: pub.newspaper_id,
        page_type_id: pub.order_item.page_type_id,
        ad_shape_id: shapeId,
        newspaper: { business_id: ctx.businessId },
      },
      select: { price: true },
    });
    if (!rule) throw new PublicationEditError("לגודל הזה אין מחיר במחירון — יש לקבוע מחיר קודם");

    const list = Number(rule.price);
    const net = roundMoney(list * (1 - Number(pub.discount_percent) / 100));

    await tx.adOrderItem.update({
      where: { id: pub.order_item_id! },
      data: { ad_shape_id: shapeId, price: list },
    });
    await tx.publication.update({
      where: { id: pub.id },
      data: { ad_shape_id: shapeId, price: net },
    });
    await recalcOrderPaymentStatus(tx, ctx.businessId, pub.order_id);
    await tx.auditLog.create({
      data: {
        business_id: ctx.businessId,
        user_id: ctx.userId,
        action: "update_order_lines",
        target_type: "AdOrder",
        target_id: pub.order_id,
        old_value: { publication: pub.id, ad_shape_id: pub.ad_shape_id, price: Number(pub.price) },
        new_value: { publication: pub.id, ad_shape_id: shapeId, price: net },
      },
    });
    return { from: Number(pub.price), to: net };
  });
}
