/**
 * The quick-search window's reads (redesign, 29/09/2026).
 *
 * Five of each, because the window is for jumping, not browsing — the lists
 * behind it page and search in full. Scoped by the tenant client like every
 * other read here (conventions.md §2).
 */
import { tenantDb } from "./db";
import { orderNumberNeedle } from "@/lib/domain/list-view";

const TAKE = 5;

export async function searchForPalette(
  businessId: string,
  q: string,
  may: { customers: boolean; orders: boolean },
) {
  const db = tenantDb(businessId);
  const number = orderNumberNeedle(q);

  const [customers, orders] = await Promise.all([
    may.customers
      ? db.customer.findMany({
          where: {
            OR: [
              { business_name: { contains: q, mode: "insensitive" } },
              // The person who answers the phone is often how a business is
              // remembered — the same rule as the customer list's search.
              { contacts: { some: { name: { contains: q, mode: "insensitive" } } } },
              { phone: { contains: q } },
            ],
          },
          orderBy: { business_name: "asc" },
          select: { id: true, business_name: true },
          take: TAKE,
        })
      : Promise.resolve([]),
    may.orders
      ? db.adOrder.findMany({
          where: {
            OR: [
              ...(number !== null ? [{ number }] : []),
              { customer: { business_name: { contains: q, mode: "insensitive" as const } } },
            ],
          },
          orderBy: { created_at: "desc" },
          select: { id: true, number: true, customer: { select: { business_name: true } } },
          take: TAKE,
        })
      : Promise.resolve([]),
  ]);

  return {
    customers: customers.map((c) => ({ id: c.id, name: c.business_name })),
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      customerName: o.customer.business_name,
    })),
  };
}
