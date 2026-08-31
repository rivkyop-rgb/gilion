"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import * as data from "@/lib/data/reminders";
import { validateReminderDays } from "@/lib/domain/reminders";

export type ReminderState = { message?: string; ok?: boolean; note?: string };

const ids = z.array(z.string().min(1)).min(1);

/**
 * Recomputes the list from the publications as they stand right now.
 *
 * There is no cron in the MVP, so this runs when someone opens the screen and
 * when they ask for it explicitly. That is a deliberate limit and not an
 * oversight: a background job that quietly decides who gets chased is exactly
 * what FR-11 keeps out of this release.
 */
export async function refreshRemindersAction(): Promise<ReminderState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "reminders");

  const { created, cleared } = await data.refreshReminders(ctx.businessId);
  revalidatePath("/reminders");
  return {
    ok: true,
    note:
      created === 0 && cleared === 0 ? "הרשימה כבר מעודכנת" : `נוספו ${created}, הוסרו ${cleared}`,
  };
}

/**
 * Marks reminders as ready to go out. It SENDS NOTHING — FR-11 is explicit
 * that the MVP shows a list and a person acts on it.
 */
export async function approveRemindersAction(reminderIds: string[]): Promise<ReminderState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "reminders", "write");

  const parsed = ids.safeParse(reminderIds);
  if (!parsed.success) return { message: "לא נבחרו תזכורות" };

  await data.setReminderStatus(ctx.businessId, parsed.data, "approved_to_send");
  revalidatePath("/reminders");
  return { ok: true };
}

export async function markRemindersSentAction(reminderIds: string[]): Promise<ReminderState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "reminders", "write");

  const parsed = ids.safeParse(reminderIds);
  if (!parsed.success) return { message: "לא נבחרו תזכורות" };

  await data.setReminderStatus(ctx.businessId, parsed.data, "sent");
  revalidatePath("/reminders");
  return { ok: true };
}

/**
 * Removes a reminder without recording that anyone was contacted.
 *
 * For the case where chasing is simply not appropriate — the file is coming by
 * hand, the customer was spoken to in person. A refresh can bring it back if
 * the publication still qualifies, which is the honest behaviour: dismissing
 * is "not now", not "never".
 */
export async function dismissRemindersAction(reminderIds: string[]): Promise<ReminderState> {
  const ctx = await getTenantContext();
  requireArea(ctx, "reminders", "write");

  const parsed = ids.safeParse(reminderIds);
  if (!parsed.success) return { message: "לא נבחרו תזכורות" };

  await data.dismissReminders(ctx.businessId, parsed.data);
  revalidatePath("/reminders");
  return { ok: true };
}

export async function setReminderWindowAction(days: number): Promise<ReminderState> {
  const ctx = await getTenantContext();
  // Admin only: the window decides who the business chases and when, which is
  // a policy rather than a day-to-day action (stage 10 §הרשאות).
  requireArea(ctx, "settings", "write");

  const error = validateReminderDays(days);
  if (error) return { message: error };

  await data.setReminderWindow(ctx.businessId, days);
  await data.refreshReminders(ctx.businessId);
  revalidatePath("/reminders");
  revalidatePath("/settings");
  return { ok: true };
}
