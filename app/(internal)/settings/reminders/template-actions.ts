"use server";

import { revalidatePath } from "next/cache";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { withAudit } from "@/lib/data/audit";
import * as data from "@/lib/data/business-settings";
import { textFieldByKey } from "@/lib/domain/business-settings";

/**
 * The reminder wording, saved from Settings ← Reminders. Written into the same
 * text overrides as every other panel text, merged — the other texts are left
 * exactly as they are. The default, or an empty field, clears the override.
 */
export async function saveReminderTemplateAction(raw: unknown): Promise<{ message?: string }> {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");
  if (ctx.role !== "admin" && !ctx.isSuperAdmin) return { message: "רק מנהל יכול לשנות את הנוסח" };

  const field = textFieldByKey("reminder_template")!;
  const value = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (value.length > field.maxLength) {
    return { message: `הנוסח ארוך מדי — עד ${field.maxLength} תווים.` };
  }

  const before = await data.loadSettings(ctx.businessId);
  const next: Record<string, string> = { ...before.texts };
  if (value === "" || value === field.default) delete next.reminder_template;
  else next.reminder_template = value;

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "update_business_settings", targetType: "Business", targetId: ctx.businessId },
    async (tx) => {
      await data.applyPatch(tx, ctx.businessId, { text_overrides: next });
      return { old: before.texts, new: next };
    },
  );

  revalidatePath("/reminders");
  revalidatePath("/settings/reminders");
  return {};
}

/** The customer messages an admin edits beside their fields (08/11/2026). */
const MESSAGE_KEYS = ["winback_template", "misfit_template"] as const;
type MessageKey = (typeof MESSAGE_KEYS)[number];

/**
 * A customer message wording — the win-back and the misfit messages — saved
 * from Settings ← הודעות ללקוחות, or from the screen the message is sent from
 * (08/11/2026: "לאפשר לי לערוך פעם אחת את ההודעה … וזה ישמש לי לתבנית להבא").
 * Same override, same rules, as the reminder wording above.
 */
export async function saveMessageTemplateAction(
  key: unknown,
  raw: unknown,
): Promise<{ message?: string }> {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");
  if (ctx.role !== "admin" && !ctx.isSuperAdmin) return { message: "רק מנהל יכול לשנות את הנוסח" };
  if (!MESSAGE_KEYS.includes(key as MessageKey)) return { message: "נוסח לא מוכר" };
  const name = key as MessageKey;

  const field = textFieldByKey(name)!;
  const value = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (value.length > field.maxLength) {
    return { message: `הנוסח ארוך מדי — עד ${field.maxLength} תווים.` };
  }

  const before = await data.loadSettings(ctx.businessId);
  const next: Record<string, string> = { ...before.texts };
  if (value === "" || value === field.default) delete next[name];
  else next[name] = value;

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "update_business_settings", targetType: "Business", targetId: ctx.businessId },
    async (tx) => {
      await data.applyPatch(tx, ctx.businessId, { text_overrides: next });
      return { old: before.texts, new: next };
    },
  );

  revalidatePath("/reports");
  revalidatePath("/publications/misfit");
  revalidatePath("/settings/messages");
  return {};
}
