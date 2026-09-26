"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { setMailClient } from "@/lib/data/business-settings";

/** Admin panel: where email links open — Gmail or the computer's mail program. */
export async function setMailClientAction(value: unknown): Promise<{ message?: string }> {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");
  const parsed = z.enum(["gmail", "mailto"]).safeParse(value);
  if (!parsed.success) return { message: "ערך לא תקין" };
  await setMailClient(ctx.businessId, parsed.data);
  // Every screen with an email link reads it through the layout.
  revalidatePath("/", "layout");
  return {};
}
