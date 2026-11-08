"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { setInternalOrdersNeedApproval } from "@/lib/data/orders";
import { creditPolicy, setCreditPolicy } from "@/lib/data/credit-block";
import { withAudit } from "@/lib/data/audit";

export type SettingState = { ok?: boolean; message?: string };

/** Admin panel: does an office order wait for a separate approval click? */
export async function setOrdersNeedApprovalAction(value: unknown): Promise<SettingState> {
  const ctx = await getTenantContext();
  // A policy for the whole business, not a day-to-day action.
  requireArea(ctx, "settings", "write");

  const parsed = z.boolean().safeParse(value);
  if (!parsed.success) return { message: "ערך לא תקין" };

  await setInternalOrdersNeedApproval(ctx.businessId, parsed.data);
  revalidatePath("/settings");
  revalidatePath("/orders");
  revalidatePath("/dashboard");
  return { ok: true };
}

const creditSchema = z.object({
  days: z.number().int().min(1).max(3650).nullable(),
  amount: z.number().min(1).max(100_000_000).nullable(),
});

/**
 * The credit block's limits (08/11/2026). Either, both or neither: an empty
 * field means "no limit by this", and with both empty nobody is ever blocked.
 */
export async function setCreditPolicyAction(raw: unknown): Promise<SettingState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");
  if (ctx.role !== "admin" && !ctx.isSuperAdmin) return { message: "רק מנהל יכול לקבוע חסימה" };

  const parsed = creditSchema.safeParse(raw);
  if (!parsed.success) return { message: "ערכים לא תקינים — ימים ממספר 1, וסכום חיובי" };

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "update_business_settings", targetType: "Business", targetId: ctx.businessId },
    async (tx) => {
      const before = await creditPolicy(ctx.businessId);
      await setCreditPolicy(ctx.businessId, parsed.data, tx);
      return { old: { credit_block: before }, new: { credit_block: parsed.data } };
    },
  );
  revalidatePath("/settings/orders");
  revalidatePath("/customers");
  revalidatePath("/billing");
  return { ok: true };
}
