/**
 * Customers who advertised in a period — to ask them again (the user,
 * 03/11/2026: "לסנן מי פרסם לפי תאריך / לקוח … להזכיר ללקוחות שפרסמו שנה שעברה
 * אם רוצים שוב"). A tab of the reports screen, with the same period, newspaper
 * and customer filters — not a screen of its own (her words: no needless
 * screens).
 *
 * One row per customer, not per publication: the call is to a customer. A
 * customer who already has something booked after the period is left out by
 * default — asking someone who already came back is the one message that
 * makes the business look like it is not paying attention.
 */
import { tenantDb } from "./db";
import type { ReportFilters } from "./payments";

export type WinbackRow = {
  customerId: string;
  customerName: string;
  count: number;
  lastDate: Date;
  newspapers: string[];
  lastShape: string;
  /** Booked again after the period. */
  returned: boolean;
  phone: string | null;
  email: string | null;
  reminders_to_main: boolean;
  contacts: Array<{
    name: string;
    role: string | null;
    phone: string | null;
    email: string | null;
    receives_reminders: boolean;
  }>;
};

/** What only this tab filters by (08/11/2026: "לסנן גם לפי גודל … וכו"). */
export type WinbackOptions = {
  /** Only publications of this ad shape count. */
  shapeId?: string;
  /** At least this many publications in the period — a regular, not a one-off. */
  minCount?: number;
};

export async function winbackReport(
  businessId: string,
  filters: ReportFilters,
  options: WinbackOptions = {},
): Promise<WinbackRow[]> {
  const db = tenantDb(businessId);
  const newspaper =
    filters.newspaperId && filters.newspaperId !== "all"
      ? { newspaper_id: filters.newspaperId }
      : {};
  const rows = await db.publication.findMany({
    where: {
      status: { not: "canceled" },
      publication_date: {
        ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00Z`) } : {}),
        ...(filters.to ? { lte: new Date(`${filters.to}T00:00:00Z`) } : {}),
      },
      ...newspaper,
      ...(filters.customerId && filters.customerId !== "all"
        ? { customer_id: filters.customerId }
        : {}),
      ...(options.shapeId ? { ad_shape_id: options.shapeId } : {}),
    },
    orderBy: { publication_date: "desc" },
    take: 10000,
    select: {
      publication_date: true,
      customer_id: true,
      newspaper: { select: { name: true } },
      ad_shape: { select: { name: true } },
    },
  });
  if (rows.length === 0) return [];

  const byCustomer = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push(r);
    byCustomer.set(r.customer_id, list);
  }
  const min = Math.max(1, Math.trunc(options.minCount ?? 1));
  for (const [id, list] of byCustomer) if (list.length < min) byCustomer.delete(id);
  if (byCustomer.size === 0) return [];
  const ids = [...byCustomer.keys()];

  const [customers, later] = await Promise.all([
    db.customer.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        business_name: true,
        phone: true,
        email: true,
        reminders_to_main: true,
        contacts: {
          orderBy: { position: "asc" },
          select: { name: true, role: true, phone: true, email: true, receives_reminders: true },
        },
      },
    }),
    filters.to
      ? db.publication.findMany({
          where: {
            customer_id: { in: ids },
            status: { not: "canceled" },
            publication_date: { gt: new Date(`${filters.to}T00:00:00Z`) },
            ...newspaper,
          },
          distinct: ["customer_id"],
          select: { customer_id: true },
        })
      : Promise.resolve([]),
  ]);
  const returned = new Set(later.map((p) => p.customer_id));

  return customers
    .map((c) => {
      const pubs = byCustomer.get(c.id)!;
      return {
        customerId: c.id,
        customerName: c.business_name,
        count: pubs.length,
        lastDate: pubs[0]!.publication_date,
        newspapers: [...new Set(pubs.map((p) => p.newspaper.name))],
        lastShape: pubs[0]!.ad_shape.name,
        returned: returned.has(c.id),
        phone: c.phone,
        email: c.email,
        reminders_to_main: c.reminders_to_main,
        contacts: c.contacts,
      };
    })
    .sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
}
