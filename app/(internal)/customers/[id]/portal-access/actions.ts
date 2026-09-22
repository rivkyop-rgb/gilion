"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { getCustomer } from "@/lib/data/customers";
import { resetPasswordForMember } from "@/lib/data/account";
import * as data from "@/lib/data/portal-accounts";
import { validateNewPassword } from "@/lib/domain/password";
import { emailTaken } from "@/lib/data/team";
import { validatePortalAccount } from "@/lib/domain/portal-account";
import { normalizeEmail } from "@/lib/domain/team";

export type PortalAccountState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
  created?: boolean;
};

/**
 * Handing someone a login is a settings act, the same as adding staff: admin
 * only (FR-8). A salesperson can see the customer; they cannot mint a way in.
 */
async function requireAdmin() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");
  return ctx;
}

const schema = z.object({ name: z.string(), email: z.string(), password: z.string() });

export async function createPortalAccountAction(
  customerId: string,
  _prev: PortalAccountState,
  formData: FormData,
): Promise<PortalAccountState> {
  const ctx = await requireAdmin();

  const customer = await getCustomer(ctx.businessId, customerId);
  if (!customer) return { message: "הלקוח לא נמצא" };

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { message: "הטופס לא נשלח כראוי" };

  const input = { ...parsed.data, email: normalizeEmail(parsed.data.email) };
  const values = { ...input };

  const errors = validatePortalAccount(input);
  if (errors.length) {
    return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])), values };
  }

  // Same refusal as for staff: an address already in the system may belong to
  // another business, and attaching it here would be a cross-tenant act.
  if (await emailTaken(input.email)) {
    return { errors: { email: "כתובת המייל הזאת כבר רשומה במערכת" }, values };
  }

  await data.createPortalAccount(ctx.businessId, customer.id, input);
  revalidatePath(`/customers/${customer.id}/portal-access`);
  return { created: true };
}

export async function setPortalAccountStatusAction(
  customerId: string,
  membershipId: string,
  active: boolean,
): Promise<{ message?: string }> {
  const ctx = await requireAdmin();
  const ok = await data.setPortalAccountStatus(ctx.businessId, customerId, membershipId, active);
  if (!ok) return { message: "החשבון לא נמצא" };
  revalidatePath(`/customers/${customerId}/portal-access`);
  return {};
}

/**
 * The same reset, for a portal login (stage 12's open item).
 *
 * A separate action from the staff one and not a shared one with a parameter:
 * the two are reached from two screens with two different things in hand — a
 * member of this business, or a login that belongs to THIS customer — and the
 * scope is what keeps the customer card from being able to reset an admin.
 */
export async function resetPortalPasswordAction(
  customerId: string,
  userId: string,
  next: string,
  confirm: string,
): Promise<{ message?: string; done?: boolean }> {
  const ctx = await requireAdmin();

  const customer = await getCustomer(ctx.businessId, customerId);
  if (!customer) return { message: "הלקוח לא נמצא" };

  // The login must be one of THIS customer's, not merely one in this business.
  const accounts = await data.listPortalAccounts(ctx.businessId, customerId);
  if (!accounts.some((a) => a.user.id === userId)) {
    return { message: "החשבון אינו שייך ללקוח הזה" };
  }

  const errors = validateNewPassword(next, confirm);
  if (errors.length) return { message: errors[0]!.message };

  const result = await resetPasswordForMember(ctx, userId, next, "portal");
  if (result !== "ok") return { message: "החשבון לא נמצא" };

  revalidatePath(`/customers/${customerId}/portal-access`);
  return { done: true, message: "הסיסמה אופסה. יש למסור אותה ללקוח." };
}
