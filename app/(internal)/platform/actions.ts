"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getTenantContext } from "@/lib/auth/tenant";
import { requireSuperAdmin } from "@/lib/auth/rbac";
import * as data from "@/lib/data/platform";
import { normalizeEmail, validateNewBusiness } from "@/lib/domain/platform";

/**
 * `values` echoes what was submitted.
 *
 * React resets an uncontrolled form once its action resolves, so without this
 * a single validation error empties every field and the user retypes the whole
 * thing — including a password they may have only just invented. The action
 * hands the values back and the form re-seeds itself from them.
 */
export type FormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

const schema = z.object({
  businessName: z.string(),
  adminName: z.string(),
  adminEmail: z.string(),
  adminPassword: z.string(),
});

export async function createBusinessAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  // The only gate. lib/data/platform.ts is not tenant-scoped by design, so
  // nothing below this line may run without it.
  const ctx = await getTenantContext();
  requireSuperAdmin(ctx.isSuperAdmin);

  const parsed = schema.safeParse({
    businessName: formData.get("businessName"),
    adminName: formData.get("adminName"),
    adminEmail: formData.get("adminEmail"),
    adminPassword: formData.get("adminPassword"),
  });
  if (!parsed.success) return { message: "הטופס לא נשלח כראוי" };

  const input = { ...parsed.data, adminEmail: normalizeEmail(parsed.data.adminEmail) };
  const values = { ...input };

  const errors = validateNewBusiness(input);
  if (errors.length) {
    return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])), values };
  }

  if (await data.businessNameTaken(input.businessName)) {
    return { errors: { businessName: "כבר קיים עסק בשם הזה" }, values };
  }
  if (await data.emailTaken(input.adminEmail)) {
    return { errors: { adminEmail: "כתובת המייל הזאת כבר רשומה במערכת" }, values };
  }

  await data.createBusinessWithAdmin(input);

  revalidatePath("/platform");
  redirect("/platform");
}
