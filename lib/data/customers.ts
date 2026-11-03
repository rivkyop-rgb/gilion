/**
 * Customer data access. Every query goes through the tenant-scoped client, so
 * a customer of another business is simply not reachable (conventions.md §2).
 */
import { Prisma } from "@prisma/client";
import { tenantDb } from "./db";

export type CustomerListFilters = {
  search?: string;
  page?: number;
  perPage?: number;
};

export type CustomerRow = {
  id: string;
  businessName: string;
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
    orderBy: [{ business_name: "asc" }],
    select: { id: true, business_name: true, phone: true },
  });
}

export async function listCustomers(businessId: string, filters: CustomerListFilters = {}) {
  const db = tenantDb(businessId);
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(100, filters.perPage ?? 25);
  const search = filters.search?.trim();

  const where: Prisma.CustomerWhereInput = {
    ...(search
      ? {
          OR: [
            { business_name: { contains: search, mode: "insensitive" } },
            // The person who answers the phone is often how a business is
            // remembered, so the people at it are searchable too.
            { contacts: { some: { name: { contains: search, mode: "insensitive" } } } },
            { tax_id: { contains: search.replace(/[\s\-./]/g, "") } },
            { phone: { contains: search } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy: [{ business_name: "asc" }],
      include: { contacts: { orderBy: { position: "asc" }, take: 1 } },
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
    orderBy: [{ business_name: "asc" }],
    select: { id: true, business_name: true },
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
    business_name: string;
    tax_id: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    preferred_page?: number | null;
    no_auto_place?: boolean;
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
  receives_reminders: boolean;
  receives_tear_sheets: boolean;
  receives_billing: boolean;
  position: number;
};

export async function updateCustomer(
  businessId: string,
  id: string,
  data: {
    business_name?: string;
    tax_id?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
    preferred_page?: number | null;
    no_auto_place?: boolean;
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

/** ח.פ / ע.מ is unique within a business; checked here for a Hebrew refusal
    rather than a unique-index error. */
export async function taxIdTaken(businessId: string, taxId: string, exceptId?: string) {
  const found = await tenantDb(businessId).customer.findFirst({
    where: { tax_id: taxId, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  return found !== null;
}

/** The tick on the customer's card: the business's own details get reminders. */
export async function setMainReceivesReminders(businessId: string, id: string, on: boolean) {
  return tenantDb(businessId).customer.update({
    where: { id },
    data: { reminders_to_main: on },
  });
}

/**
 * The tick next to a contact. Written THROUGH the customer, so the tenant scope
 * of the customer covers the contact — a contact id from another business
 * matches nothing under this customer and the update fails.
 */
export async function setContactReceivesReminders(
  businessId: string,
  customerId: string,
  contactId: string,
  on: boolean,
) {
  return tenantDb(businessId).customer.update({
    where: { id: customerId },
    data: {
      contacts: { update: { where: { id: contactId }, data: { receives_reminders: on } } },
    },
  });
}

/** What a contact can be ticked for on the customer's card (the user, 31/10/2026). */
export type RecipientKind = "reminders" | "tear_sheets" | "billing";

const MAIN_COLUMN = {
  reminders: "reminders_to_main",
  tear_sheets: "tear_sheets_to_main",
  billing: "billing_to_main",
} as const;
const CONTACT_COLUMN = {
  reminders: "receives_reminders",
  tear_sheets: "receives_tear_sheets",
  billing: "receives_billing",
} as const;

/**
 * One tick in the "who gets what" table. A contact is written THROUGH the
 * customer, so the customer's tenant scope covers it (see
 * setContactReceivesReminders).
 */
export async function setRecipient(
  businessId: string,
  customerId: string,
  target: string,
  kind: RecipientKind,
  on: boolean,
) {
  if (target === "main") {
    return tenantDb(businessId).customer.update({
      where: { id: customerId },
      data: { [MAIN_COLUMN[kind]]: on },
    });
  }
  return tenantDb(businessId).customer.update({
    where: { id: customerId },
    data: { contacts: { update: { where: { id: target }, data: { [CONTACT_COLUMN[kind]]: on } } } },
  });
}

/**
 * Who to call about money this customer owes: everyone ticked "חוב וגבייה"
 * on the card, and the business's own details when ticked — or when nobody is,
 * because "nobody" cannot be the answer to "who do I call" (31/10/2026).
 */
export async function billingContactsOf(businessId: string, customerId: string) {
  const c = await tenantDb(businessId).customer.findUnique({
    where: { id: customerId },
    select: {
      business_name: true,
      phone: true,
      email: true,
      billing_to_main: true,
      contacts: {
        where: { receives_billing: true },
        orderBy: { position: "asc" },
        select: { name: true, role: true, phone: true, email: true },
      },
    },
  });
  if (!c) return [];
  const people = c.contacts.map((p) => ({
    label: p.role ? `${p.name} · ${p.role}` : p.name,
    phone: p.phone,
    email: p.email,
  }));
  const main = { label: "פרטי העסק", phone: c.phone, email: c.email };
  return c.billing_to_main || people.length === 0 ? [main, ...people] : people;
}

export type DuplicateHit = {
  customerId: string;
  customerName: string;
  /** What matched, as stored. */
  value: string;
  kind: "phone" | "email" | "taxId";
  /** Whose detail it is at the other customer: the business, or a contact's name. */
  owner: string | null;
};

/**
 * Other customers that already carry one of these phones or emails — on the
 * business itself or on one of its contacts (the user, 31/10/2026). A warning,
 * not a refusal: the same bookkeeper can serve two advertisers.
 */
export async function findContactDuplicates(
  businessId: string,
  values: { phones: string[]; emails: string[]; taxId?: string | null },
  exceptId?: string,
): Promise<DuplicateHit[]> {
  const phones = [...new Set(values.phones.filter(Boolean))];
  const emails = [...new Set(values.emails.filter(Boolean))];
  const taxId = values.taxId?.trim() || null;
  if (phones.length === 0 && emails.length === 0 && !taxId) return [];

  const found = await tenantDb(businessId).customer.findMany({
    where: {
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
      OR: [
        ...(taxId ? [{ tax_id: taxId }] : []),
        ...(phones.length ? [{ phone: { in: phones } }] : []),
        ...(emails.length ? [{ email: { in: emails, mode: "insensitive" as const } }] : []),
        {
          contacts: {
            some: {
              OR: [
                ...(phones.length ? [{ phone: { in: phones } }] : []),
                ...(emails.length ? [{ email: { in: emails, mode: "insensitive" as const } }] : []),
              ],
            },
          },
        },
      ],
    },
    take: 20,
    select: {
      id: true,
      business_name: true,
      tax_id: true,
      phone: true,
      email: true,
      contacts: { select: { name: true, phone: true, email: true } },
    },
  });

  const lower = new Set(emails.map((e) => e.toLowerCase()));
  const hits: DuplicateHit[] = [];
  for (const c of found) {
    if (taxId && c.tax_id === taxId) {
      hits.push({ customerId: c.id, customerName: c.business_name, value: taxId, kind: "taxId", owner: null });
    }
    const add = (value: string | null, kind: "phone" | "email", owner: string | null) => {
      if (!value) return;
      const match = kind === "phone" ? phones.includes(value) : lower.has(value.toLowerCase());
      if (match) hits.push({ customerId: c.id, customerName: c.business_name, value, kind, owner });
    };
    add(c.phone, "phone", null);
    add(c.email, "email", null);
    for (const p of c.contacts) {
      add(p.phone, "phone", p.name);
      add(p.email, "email", p.name);
    }
  }
  return hits;
}

/** The customer a ח.פ already belongs to — named in the refusal. */
export async function taxIdOwner(businessId: string, taxId: string, exceptId?: string) {
  return tenantDb(businessId).customer.findFirst({
    where: { tax_id: taxId, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true, business_name: true },
  });
}
