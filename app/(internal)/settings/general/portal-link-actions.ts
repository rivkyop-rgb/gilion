"use server";

import { revalidatePath } from "next/cache";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { withAudit } from "@/lib/data/audit";
import { businessSlug, slugTaken } from "@/lib/data/portal-link";
import { normalizeSlug, slugError } from "@/lib/domain/portal-link";

export type SlugState = { error?: string; ok?: boolean };

/** The portal address is the admin's to set, like the rest of the panel. */
export async function updatePortalSlugAction(
  _prev: SlugState,
  formData: FormData,
): Promise<SlugState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  const slug = normalizeSlug(String(formData.get("slug") ?? ""));
  const invalid = slugError(slug);
  if (invalid) return { error: invalid };

  const before = await businessSlug(ctx.businessId);
  if (slug === before) return { ok: true };
  if (await slugTaken(slug, ctx.businessId))
    return { error: "הכתובת הזאת כבר תפוסה על ידי עיתון אחר" };

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "update_business_settings", targetType: "Business", targetId: ctx.businessId },
    async (tx) => {
      await tx.business.update({ where: { id: ctx.businessId }, data: { slug } });
      return { old: { slug: before }, new: { slug } };
    },
  );

  revalidatePath("/settings/general");
  return { ok: true };
}
