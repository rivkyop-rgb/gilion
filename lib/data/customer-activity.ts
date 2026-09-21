/**
 * Everything the customer card shows about one customer (US-002, US-010).
 *
 * Deliberately its own module rather than more functions on customers.ts: this
 * reads across orders, publications and advertisements, and keeping the
 * customer CRUD free of those joins is what keeps the delete guard and the
 * validation easy to read.
 *
 * Every list here is PAGED AND SEARCHED IN THE DATABASE, and returns its total
 * alongside its rows. Each used to end in a bare `take: 100` — a cap that
 * silently dropped a veteran customer's older rows while the screen went on
 * looking complete. A count costs one more query and is what lets the screen
 * say "21–30 מתוך 84" instead of quietly lying.
 */
import type { Prisma } from "@prisma/client";

import { tenantDb } from "./db";
import { orderNumberNeedle, skipFor, type ListParams } from "@/lib/domain/list-view";

/** Case-insensitive `contains`, the shape Prisma wants it in. */
const like = (q: string) => ({ contains: q, mode: "insensitive" as const });

export async function customerOrders(businessId: string, customerId: string, params: ListParams) {
  const db = tenantDb(businessId);
  const wanted = orderNumberNeedle(params.q);
  const where: Prisma.AdOrderWhereInput = {
    customer_id: customerId,
    ...(params.q
      ? {
          OR: [
            // The order number as it is printed — ORD-0042, 0042 or 42.
            ...(wanted === null ? [] : [{ number: wanted }]),
            { external_invoice_number: like(params.q) },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.adOrder.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: skipFor(params),
      take: params.size,
      select: {
        id: true,
        number: true,
        status: true,
        source: true,
        total_price: true,
        payment_status: true,
        external_invoice_number: true,
        created_at: true,
        approved_at: true,
        _count: { select: { publications: true } },
      },
    }),
    db.adOrder.count({ where }),
  ]);
  return { rows, total };
}

export async function customerPublications(
  businessId: string,
  customerId: string,
  params: ListParams,
) {
  const db = tenantDb(businessId);
  const wanted = orderNumberNeedle(params.q);
  const where: Prisma.PublicationWhereInput = {
    customer_id: customerId,
    ...(params.q
      ? {
          OR: [
            { newspaper: { name: like(params.q) } },
            { ad_shape: { name: like(params.q) } },
            // Asked for by name: every publication of one order, found by
            // typing the order number off the row above it.
            ...(wanted === null ? [] : [{ order: { number: wanted } }]),
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.publication.findMany({
      where,
      orderBy: { publication_date: "desc" },
      skip: skipFor(params),
      take: params.size,
      select: {
        id: true,
        publication_date: true,
        status: true,
        price: true,
        payment_status: true,
        advertisement_id: true,
        // Which order this came from. A publication only exists because an
        // order was approved, and that link was reachable from the orders table
        // but not from this one.
        order_id: true,
        order: { select: { number: true } },
        newspaper: { select: { name: true } },
        ad_shape: { select: { name: true } },
      },
    }),
    db.publication.count({ where }),
  ]);
  return { rows, total };
}

export async function customerAdvertisements(
  businessId: string,
  customerId: string,
  params: ListParams,
) {
  const db = tenantDb(businessId);
  const where: Prisma.AdvertisementWhereInput = {
    customer_id: customerId,
    ...(params.q ? { name: like(params.q) } : {}),
  };

  const [rows, total] = await Promise.all([
    db.advertisement.findMany({
      where,
      orderBy: { uploaded_at: "desc" },
      skip: skipFor(params),
      take: params.size,
      select: {
        id: true,
        name: true,
        file_type: true,
        file_size: true,
        preview_url: true,
        status: true,
        validation_status: true,
        uploaded_at: true,
        _count: { select: { publications: true } },
      },
    }),
    db.advertisement.count({ where }),
  ]);
  return { rows, total };
}
