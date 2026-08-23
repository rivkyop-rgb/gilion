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

export async function getCustomer(businessId: string, id: string) {
  return tenantDb(businessId).customer.findUnique({ where: { id } });
}

export async function createCustomer(
  businessId: string,
  data: {
    customer_type: CustomerType;
    business_name: string | null;
    contact_name: string;
    phone: string | null;
    email: string | null;
  },
) {
  // business_id is injected by the tenant extension — deliberately not passed here.
  return tenantDb(businessId).customer.create({ data: data as never });
}

export async function updateCustomer(
  businessId: string,
  id: string,
  data: {
    customer_type?: CustomerType;
    business_name?: string | null;
    contact_name?: string;
    phone?: string | null;
    email?: string | null;
  },
) {
  return tenantDb(businessId).customer.update({ where: { id }, data });
}

/**
 * Counts of everything that would be orphaned by a delete. Stage 02 has no
 * dependent entities yet, so the counts are all zero — the shape is here so
 * that stages 04, 05 and 08 only have to fill it in, and the blocking rule
 * does not have to be rediscovered later.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- the parameters are the
   contract stages 04/05/08 will fill in; keeping them documents the signature. */
export async function customerHistoryCounts(
  businessId: string,
  id: string,
): Promise<Record<string, number>> {
  return { orders: 0, publications: 0, advertisements: 0, payments: 0 };
}
/* eslint-enable @typescript-eslint/no-unused-vars */

export async function deleteCustomer(businessId: string, id: string) {
  return tenantDb(businessId).customer.delete({ where: { id } });
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
