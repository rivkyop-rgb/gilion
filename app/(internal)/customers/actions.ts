"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import {
  assertConvertible,
  contactsToStorage,
  deletionBlockedMessage,
  InvalidConversionError,
  toStorage,
  validateCustomer,
  type CustomerInput,
} from "@/lib/domain/customer";
import { withAudit } from "@/lib/data/audit";
import * as data from "@/lib/data/customers";

/** Field-level errors keyed the way the form renders them. */
export type FormState = {
  errors?: Partial<Record<string, string>>;
  message?: string;
};

const schema = z.object({
  customerType: z.enum(["regular", "casual"]),
  businessName: z.string().optional().nullable(),
  contactName: z.string(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  contacts: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
      }),
    )
    .max(50),
});

/**
 * The contacts editor repeats four named fields per row, so the rows arrive as
 * four parallel lists in document order — uncontrolled inputs, no JSON copy of
 * the values held in React state to disagree with the DOM.
 */
function readContacts(formData: FormData) {
  const col = (name: string) => formData.getAll(name).map(String);
  const names = col("contact_name");
  const roles = col("contact_role");
  const phones = col("contact_phone");
  const emails = col("contact_email");
  return names.map((name, i) => ({
    name,
    role: roles[i] ?? null,
    phone: phones[i] ?? null,
    email: emails[i] ?? null,
  }));
}

function readForm(formData: FormData): CustomerInput | null {
  const parsed = schema.safeParse({
    customerType: formData.get("customerType"),
    businessName: formData.get("businessName"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    notes: formData.get("notes"),
    contacts: readContacts(formData),
  });
  return parsed.success ? parsed.data : null;
}

function toErrorMap(errors: { field: string; message: string }[]) {
  return Object.fromEntries(errors.map((e) => [e.field, e.message]));
}

export async function createCustomerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");

  const input = readForm(formData);
  if (!input) return { message: "הטופס לא נשלח כראוי" };

  const errors = validateCustomer(input);
  if (errors.length > 0) return { errors: toErrorMap(errors) };

  const stored = toStorage(input);
  if (stored.email && (await data.emailTaken(ctx.businessId, stored.email))) {
    return { errors: { email: "כתובת המייל כבר קיימת אצל לקוח אחר בעסק הזה" } };
  }

  const created = await data.createCustomer(
    ctx.businessId,
    stored,
    contactsToStorage(input.contacts),
  );
  revalidatePath("/customers");
  redirect(`/customers/${created.id}`);
}

export async function updateCustomerAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");

  const input = readForm(formData);
  if (!input) return { message: "הטופס לא נשלח כראוי" };

  const existing = await data.getCustomer(ctx.businessId, id);
  if (!existing) return { message: "הלקוח לא נמצא" };

  // Rule 6 lives in the domain layer, but the edit form must not become a
  // back door around it: changing the type here is refused outright.
  if (input.customerType !== existing.customer_type) {
    return { message: "שינוי סוג לקוח נעשה דרך פעולת ההמרה, לא דרך העריכה" };
  }

  const errors = validateCustomer(input);
  if (errors.length > 0) return { errors: toErrorMap(errors) };

  const stored = toStorage(input);
  if (stored.email && (await data.emailTaken(ctx.businessId, stored.email, id))) {
    return { errors: { email: "כתובת המייל כבר קיימת אצל לקוח אחר בעסק הזה" } };
  }

  await data.updateCustomer(ctx.businessId, id, stored, contactsToStorage(input.contacts));
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}

/**
 * casual → regular. The id is untouched, which is precisely what preserves the
 * customer's history (US-002 rule 7).
 */
export async function convertToRegularAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");

  const existing = await data.getCustomer(ctx.businessId, id);
  if (!existing) return { message: "הלקוח לא נמצא" };

  const businessName = String(formData.get("businessName") ?? "");

  try {
    assertConvertible(existing.customer_type, "regular", businessName);
  } catch (e) {
    if (e instanceof InvalidConversionError) return { errors: { businessName: e.message } };
    throw e;
  }

  await data.updateCustomer(ctx.businessId, id, {
    customer_type: "regular",
    business_name: businessName.trim(),
  });

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?converted=1`);
}

export async function deleteCustomerAction(id: string): Promise<FormState> {
  const ctx = await getTenantContext();
  // Deletion is admin-only (stage 02 permission table), stricter than write.
  if (ctx.role !== "admin") return { message: "רק מנהל יכול למחוק לקוח" };

  const existing = await data.getCustomer(ctx.businessId, id);
  if (!existing) return { message: "הלקוח לא נמצא" };

  const blocked = deletionBlockedMessage(await data.customerHistoryCounts(ctx.businessId, id));
  if (blocked) return { message: blocked };

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "delete_customer", targetType: "Customer", targetId: id },
    async (tx) => {
      // The log row is all that survives the delete, so it carries enough to
      // answer "who was removed" — the guard above has already proved there is
      // no history hanging off them to name.
      const snapshot = {
        customer_type: existing.customer_type,
        business_name: existing.business_name,
        contact_name: existing.contact_name,
        phone: existing.phone,
        email: existing.email,
      };
      // deleteMany, not delete: the raw transaction client is outside the
      // tenant extension, so the business id is carried by hand here.
      await tx.customer.deleteMany({ where: { id, business_id: ctx.businessId } });
      return { old: snapshot, new: null };
    },
  );

  revalidatePath("/customers");
  redirect("/customers");
}
