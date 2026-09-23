/**
 * Customer data access. Every query goes through the tenant-scoped client, so
 * a customer of another business is simply not reachable (conventions.md §2).
 */
import { Prisma } from "@prisma/client";
import { tenantDb } from "./db";
import type { CustomerType } from "@/lib/domain/customer";

export type CustomerListFilters = {
  search?: string;
  type?: CustomerType | "all";
  page?: number;
  perPage?: number;
};

export type CustomerRow = {
  id: string;
  customerType: CustomerType;
  businessName: string | null;
  contactName: string;
  phone: string | null;
  email: string | null;
};

/**
 * Hebrew search is substring-based, so this is a case-insensitive contains
 * across both name columns — the pg_trgm indexes added in the migration are
 * what keep it from becoming a sequential scan.
 */
/**
 * Every customer, as the bare fields a picker needs.
 *
 * Deliberately separate from `listCustomers`, which is paginated and caps at
 * 100 rows: a type-to-filter picker that only received the first page would
 * quietly fail to find customer 101, which is exactly the customer the search
 * exists for. The trade is one unpaginated query per form load, of three short
 * columns — cheap enough that filtering can happen in the browser with no
 * round trip per keystroke.
 */
export async function listCustomerOptions(businessId: string) {
  return tenantDb(businessId).customer.findMany({
    orderBy: [{ contact_name: "asc" }],
    select: { id: true, contact_name: true, business_name: true, phone: true },
  });
}

export async function listCustomers(businessId: string, filters: CustomerListFilters = {}) {
  const db = tenantDb(businessId);
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(100, filters.perPage ?? 25);
  const search = filters.search?.trim();

  const where: Prisma.CustomerWhereInput = {
    ...(filters.type && filters.type !== "all" ? { customer_type: filters.type } : {}),
    ...(search
      ? {
          OR: [
            { contact_name: { contains: search, mode: "insensitive" } },
            { business_name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: [{ contact_name: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.customer.count({ where }),
  ]);

  return { rows, total, page, perPage, pages: Math.max(1, Math.ceil(total / perPage)) };
}

/**
 * Every customer, as a picker option.
 *
 * Separate from `listCustomers` because that one paginates: a filter dropdown
 * that silently stops at the twenty-fifth customer is a filter that cannot find
 * the twenty-sixth, and nothing on the screen would say so.
 */
export async function customerOptions(businessId: string) {
  return tenantDb(businessId).customer.findMany({
    orderBy: [{ contact_name: "asc" }],
    select: { id: true, business_name: true, contact_name: true },
    take: 1000,
  });
}

export async function getCustomer(businessId: string, id: string) {
  return tenantDb(businessId).customer.findUnique({
    where: { id },
    include: { contacts: { orderBy: { position: "asc" } } },
  });
}

export async function createCustomer(
  businessId: string,
  data: {
    customer_type: CustomerType;
    business_name: string | null;
    contact_name: string;
    phone: string | null;
    email: string | null;
    notes?: string | null;
  },
  contacts: StoredContact[] = [],
) {
  // business_id is injected by the tenant extension — deliberately not passed here.
  return tenantDb(businessId).customer.create({
    data: { ...data, contacts: { create: contacts } } as never,
  });
}

type StoredContact = {
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  position: number;
};

export async function updateCustomer(
  businessId: string,
  id: string,
  data: {
    customer_type?: CustomerType;
    business_name?: string | null;
    contact_name?: string;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
  },
  /** Given → the list is REPLACED by this one; omitted → contacts untouched. */
  contacts?: StoredContact[],
) {
  // One nested write, so the customer and its contacts change together or not
  // at all — and through the customer, whose tenant scope covers them.
  return tenantDb(businessId).customer.update({
    where: { id },
    data: contacts ? { ...data, contacts: { deleteMany: {}, create: contacts } } : data,
  });
}

/**
 * What stands behind a customer, for the deletion guard.
 *
 * This used to return zeros for everything — a stand-in written before the
 * tables existed, which meant the guard never blocked anything and a delete
 * on a real customer reached the database and failed there on a foreign key
 * instead of being refused with an explanation.
 *
 * EVERY table that points here with onDelete: Restrict must be counted, or the
 * guard hands the delete to the database and the refusal comes back as a raw
 * foreign-key error instead of a sentence. Advertisements (stage 05) and
 * payments (stage 08) were left out when their stages were built — stage 02
 * §deviation 4 said they would be added and they were not — so a customer
 * carrying only an uploaded ad, or only a payment recorded with no order,
 * passed the guard and blew up in Prisma. Added 23/09/2026.
 *
 * Portal users are counted by hand because UserMembership.customer_id carries
 * no foreign key — nothing in the database would stop a customer being deleted
 * out from under one.
 */
export async function customerHistoryCounts(
  businessId: string,
  id: string,
): Promise<Record<string, number>> {
  const db = tenantDb(businessId);
  const [orders, publications, advertisements, payments, portalUsers] = await Promise.all([
    db.adOrder.count({ where: { customer_id: id } }),
    db.publication.count({ where: { customer_id: id } }),
    db.advertisement.count({ where: { customer_id: id } }),
    db.payment.count({ where: { customer_id: id } }),
    db.userMembership.count({ where: { customer_id: id } }),
  ]);
  return { orders, publications, advertisements, payments, portalUsers };
}

/** True when the email is already taken by a *different* customer in this business. */
export async function emailTaken(businessId: string, email: string, exceptId?: string) {
  const found = await tenantDb(businessId).customer.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  return found !== null;
}
