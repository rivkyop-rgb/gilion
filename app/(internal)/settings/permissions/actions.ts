"use server";

import { revalidatePath } from "next/cache";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { withAudit } from "@/lib/data/audit";
import { loadOverrides, replaceOverrides } from "@/lib/data/permissions";
import { readSubmittedMatrix } from "@/lib/domain/permissions";

/**
 * `saved` is what the screen states after a save, and it is deliberately the
 * number the SERVER now holds rather than the one the form is showing. The
 * form's own count changes the instant a cell is edited, so it can never say
 * whether the change reached the database — which is the one thing a person
 * clicking "save" wants to know, and the one thing a test has to wait for.
 */
export type FormState = { message?: string; ok?: boolean; saved?: number };

export async function savePermissionsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  const submitted: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.includes(":")) submitted[key] = String(value);
  }

  const result = readSubmittedMatrix(submitted);
  if ("error" in result) return { message: result.error };

  const before = await loadOverrides(ctx.businessId);

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    {
      action: "update_role_permissions",
      targetType: "Business",
      targetId: ctx.businessId,
    },
    async () => {
      // Not inside the audit transaction's client on purpose: replaceOverrides
      // opens its own, and the delete-then-insert has to be atomic in itself.
      await replaceOverrides(ctx.businessId, result.overrides);
      return { old: before, new: result.overrides };
    },
  );

  revalidatePath("/settings/permissions");
  // Deliberately NOT revalidatePath("/", "layout"). The sidebar reads the
  // overrides from app/(internal)/layout.tsx, which calls auth() and is
  // therefore dynamic — rendered fresh on every request, with no cache to
  // bust. Invalidating the root layout did nothing for it and did something
  // real to /login, which IS statically prerendered: every save forced that
  // page to regenerate, and signing in straight afterwards could time out.
  return { ok: true, saved: Object.keys(result.overrides).length };
}
