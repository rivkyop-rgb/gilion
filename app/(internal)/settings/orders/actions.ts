"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { setInternalOrdersNeedApproval } from "@/lib/data/orders";

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
