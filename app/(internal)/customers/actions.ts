"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getTenantContext } from "@/lib/auth/tenant";
import { requireAccess } from "@/lib/auth/rbac";
import {
  assertConvertible,
  deletionBlockedMessage,
  InvalidConversionError,
  toStorage,
  validateCustomer,
  type CustomerInput,
} from "@/lib/domain/customer";
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
});

function readForm(formData: FormData): CustomerInput | null {
  const parsed = schema.safeParse({
    customerType: formData.get("customerType"),
    businessName: formData.get("businessName"),
    contactName: formData.get("contactName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
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
  requireAccess(ctx.role, "customers", "write");

  const input = readForm(formData);
  if (!input) return { message: "הטופס לא נשלח כראוי" };

  const errors = validateCustomer(input);
  if (errors.length > 0) return { errors: toErrorMap(errors) };

  const stored = toStorage(input);
  if (stored.email && (await data.emailTaken(ctx.businessId, stored.email))) {
    return { errors: { email: "כתובת המייל כבר קיימת אצל לקוח אחר בעסק הזה" } };
  }

  const created = await data.createCustomer(ctx.businessId, stored);
  revalidatePath("/customers");
  redirect(`/customers/${created.id}`);
}

export async function updateCustomerAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "customers", "write");

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

  await data.updateCustomer(ctx.businessId, id, stored);
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
  requireAccess(ctx.role, "customers", "write");

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

  await data.deleteCustomer(ctx.businessId, id);
  revalidatePath("/customers");
  redirect("/customers");
}
