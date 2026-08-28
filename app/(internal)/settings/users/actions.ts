"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext } from "@/lib/auth/tenant";
import { requireAccess } from "@/lib/auth/rbac";
import * as data from "@/lib/data/team";
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
  requireAccess(ctx.role, "settings", "write", ctx.isSuperAdmin);
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

  await data.createMember(ctx.businessId, {
    ...input,
    role: input.role as AssignableRole,
  });

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

  await data.setMemberRole(ctx.businessId, userId, role);
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

  await data.setMemberStatus(ctx.businessId, userId, status);
  revalidatePath("/settings/users");
  return {};
}
