"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { resetPasswordForMember } from "@/lib/data/account";
import * as data from "@/lib/data/team";
import { validateNewPassword } from "@/lib/domain/password";
import {
  deactivationBlocked,
  isAssignableRole,
  normalizeEmail,
  roleChangeBlocked,
  validateMember,
  type AssignableRole,
} from "@/lib/domain/team";

export type FormState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

/** Managing people is a settings act: admin only (FR-8). */
async function requireAdmin() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");
  return ctx;
}

const schema = z.object({
  name: z.string(),
  email: z.string(),
  password: z.string(),
  role: z.string(),
});

export async function addMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireAdmin();

  const parsed = schema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { message: "הטופס לא נשלח כראוי" };

  const input = { ...parsed.data, email: normalizeEmail(parsed.data.email) };
  const values = { ...input };

  const errors = validateMember(input);
  if (errors.length) {
    return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])), values };
  }

  // Deliberately refused rather than quietly attached to the existing account:
  // adding someone from another business to this one is a cross-tenant act,
  // and a business admin is not the person who should be able to perform it.
  if (await data.emailTaken(input.email)) {
    return { errors: { email: "כתובת המייל הזאת כבר רשומה במערכת" }, values };
  }

  await data.createMember(
    { businessId: ctx.businessId, userId: ctx.userId },
    { ...input, role: input.role as AssignableRole },
  );

  revalidatePath("/settings/users");
  return {};
}

export async function setMemberRoleAction(userId: string, role: string): Promise<FormState> {
  const ctx = await requireAdmin();

  const member = await data.getMember(ctx.businessId, userId);
  if (!member) return { message: "המשתמש לא נמצא בעסק הזה" };

  const everyone = await data.memberSnapshots(ctx.businessId);
  const blocked = roleChangeBlocked(
    { userId, role: member.role, active: member.status === "active" },
    role,
    ctx.userId,
    everyone,
  );
  if (blocked) return { message: blocked };
  if (!isAssignableRole(role)) return { message: "תפקיד לא מוכר" };

  await data.setMemberRole({ businessId: ctx.businessId, userId: ctx.userId }, userId, role);
  revalidatePath("/settings/users");
  return {};
}

export async function setMemberStatusAction(
  userId: string,
  status: "active" | "inactive",
): Promise<FormState> {
  const ctx = await requireAdmin();

  const member = await data.getMember(ctx.businessId, userId);
  if (!member) return { message: "המשתמש לא נמצא בעסק הזה" };

  if (status === "inactive") {
    const everyone = await data.memberSnapshots(ctx.businessId);
    const blocked = deactivationBlocked(
      { userId, role: member.role, active: member.status === "active" },
      ctx.userId,
      everyone,
    );
    if (blocked) return { message: blocked };
  }

  await data.setMemberStatus({ businessId: ctx.businessId, userId: ctx.userId }, userId, status);
  revalidatePath("/settings/users");
  return {};
}

/**
 * An admin hands a staff member a new password (stage 12's open item).
 *
 * `requireAdmin` is the same gate as the rest of this file, and the data layer
 * resolves the target through a membership in THIS business — a user id from
 * another tenant finds nothing and gets the same answer as one that does not
 * exist. `scope: "staff"` is what stops this door from reaching a portal
 * account, which belongs to the customer card and to a different screen.
 */
export async function resetMemberPasswordAction(
  userId: string,
  next: string,
  confirm: string,
): Promise<{ message?: string; done?: boolean }> {
  const ctx = await requireAdmin();

  const errors = validateNewPassword(next, confirm);
  if (errors.length) return { message: errors[0]!.message };

  const result = await resetPasswordForMember(ctx, userId, next, "staff");
  if (result !== "ok") return { message: "המשתמש לא נמצא בעסק הזה" };

  revalidatePath("/settings/users");
  return { done: true, message: "הסיסמה אופסה. יש למסור אותה למשתמש." };
}
