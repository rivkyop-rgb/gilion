"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import {
  contactsToStorage,
  deletionBlockedMessage,
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
  businessName: z.string(),
  taxId: z.string().optional().nullable(),
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
    businessName: formData.get("businessName") ?? "",
    taxId: formData.get("taxId"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    notes: formData.get("notes"),
    contacts: readContacts(formData),
  });
  return parsed.success ? parsed.data : null;
}

/** Email and ח.פ are each unique within a business — said in Hebrew, per field. */
async function uniquenessErrors(
  businessId: string,
  stored: { email: string | null; tax_id: string | null },
  exceptId?: string,
): Promise<Record<string, string> | null> {
  const [emailTaken, taxIdTaken] = await Promise.all([
    stored.email ? data.emailTaken(businessId, stored.email, exceptId) : false,
    stored.tax_id ? data.taxIdTaken(businessId, stored.tax_id, exceptId) : false,
  ]);
  const errors: Record<string, string> = {};
  if (emailTaken) errors.email = "כתובת המייל כבר קיימת אצל לקוח אחר בעסק הזה";
  if (taxIdTaken) errors.taxId = "ח.פ / ע.מ הזה כבר רשום אצל לקוח אחר";
  return Object.keys(errors).length > 0 ? errors : null;
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
  const taken = await uniquenessErrors(ctx.businessId, stored);
  if (taken) return { errors: taken };

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

  const errors = validateCustomer(input);
  if (errors.length > 0) return { errors: toErrorMap(errors) };

  const stored = toStorage(input);
  const taken = await uniquenessErrors(ctx.businessId, stored, id);
  if (taken) return { errors: taken };

  await data.updateCustomer(ctx.businessId, id, stored, contactsToStorage(input.contacts));
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
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
        business_name: existing.business_name,
        tax_id: existing.tax_id,
        contacts: existing.contacts.map((c) => c.name),
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
