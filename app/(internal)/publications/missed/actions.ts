"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canWriteArea, getTenantContext } from "@/lib/auth/tenant";
import {
  creditMissedPublication,
  MissedError,
  moveMissedPublication,
} from "@/lib/data/missed-publications";

export type MissedResult = { ok?: boolean; message?: string };

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A missed publication to another date of its newspaper (03/11/2026). */
export async function moveMissedAction(publicationId: string, date: string): Promise<MissedResult> {
  const ctx = await getTenantContext();
  if (!canWriteArea(ctx, "orders")) return { message: "אין לך הרשאה לשנות פרסומים" };
  const parsed = ISO.safeParse(date);
  if (!parsed.success) return { message: "יש לבחור תאריך" };
  try {
    await moveMissedPublication(ctx, publicationId, new Date(parsed.data));
  } catch (e) {
    if (e instanceof MissedError) return { message: e.message };
    throw e;
  }
  revalidatePath("/publications/missed");
  revalidatePath("/dashboard");
  return { ok: true, message: "הפרסום הועבר לתאריך החדש" };
}

/** Cancel it, and what was paid on it becomes the customer's credit. */
export async function creditMissedAction(publicationId: string): Promise<MissedResult> {
  const ctx = await getTenantContext();
  if (!canWriteArea(ctx, "orders")) return { message: "אין לך הרשאה לבטל פרסומים" };
  try {
    const credited = await creditMissedPublication(ctx, publicationId);
    revalidatePath("/publications/missed");
    revalidatePath("/dashboard");
    revalidatePath("/billing");
    return {
      ok: true,
      message:
        credited > 0
          ? `הפרסום בוטל, ו־₪${credited.toLocaleString("he-IL")} עברו לזיכוי הלקוח`
          : "הפרסום בוטל. לא שולם עליו, ולכן אין מה לזכות — החוב עליו ירד",
    };
  } catch (e) {
    if (e instanceof MissedError) return { message: e.message };
    throw e;
  }
}
