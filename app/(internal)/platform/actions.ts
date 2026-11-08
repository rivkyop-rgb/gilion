"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPlatformContext } from "@/lib/auth/tenant";
import { requireSuperAdmin } from "@/lib/auth/rbac";
import * as data from "@/lib/data/platform";
import { deactivationBlocked, normalizeEmail, validateNewBusiness } from "@/lib/domain/platform";
import { withAudit } from "@/lib/data/audit";

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
  const ctx = await getPlatformContext();
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
  // Says it worked, and where to go next (08/11/2026) — the habodek run landed
  // back on the list with nothing on screen admitting a business was created.
  const created = `created=${encodeURIComponent(input.businessName)}`;
  redirect(ctx.businessId ? `/platform?${created}` : `/select-business?${created}`);
}

/**
 * Closes or reopens a business.
 *
 * Audited against the AFFECTED business rather than the one the super admin
 * happens to be working in — the trail belongs to the business the act was
 * done to, which is also the only place anyone would think to look for it.
 */
export async function setBusinessStatusAction(
  businessId: string,
  status: "active" | "inactive",
): Promise<FormState> {
  const ctx = await getPlatformContext();
  requireSuperAdmin(ctx.isSuperAdmin);

  const business = await data.getBusiness(businessId);
  if (!business) return { message: "העסק לא נמצא" };
  if (business.status === status) return { message: "העסק כבר במצב הזה" };

  if (status === "inactive") {
    const blocked = ctx.businessId ? deactivationBlocked(businessId, ctx.businessId) : null;
    if (blocked) return { message: blocked };
  }

  await withAudit(
    { businessId, userId: ctx.userId },
    {
      action: status === "inactive" ? "deactivate_business" : "activate_business",
      targetType: "Business",
      targetId: businessId,
    },
    async (tx) => {
      await tx.business.update({ where: { id: businessId }, data: { status } });
      return { old: { status: business.status }, new: { status } };
    },
  );

  revalidatePath("/platform");
  return {};
}
