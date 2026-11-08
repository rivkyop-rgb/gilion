"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canReadArea, getTenantContext } from "@/lib/auth/tenant";
import * as data from "@/lib/data/saved-filters";
import {
  SAVED_FILTER_COLORS,
  SAVED_FILTER_LISTS,
  SAVED_FILTER_NAME_MAX,
  normaliseFilterQuery,
  type SavedFilterList,
} from "@/lib/domain/saved-filter";

/** Which permission area a list belongs to — reading the list is what saving needs. */
const AREA: Record<SavedFilterList, "orders" | "publications"> = {
  orders: "orders",
  publications: "publications",
};

const PATH: Record<SavedFilterList, string> = {
  orders: "/orders",
  publications: "/publications",
};

const schema = z.object({
  list: z.enum(SAVED_FILTER_LISTS),
  name: z
    .string()
    .trim()
    .min(1, "צריך שם לכפתור")
    .max(SAVED_FILTER_NAME_MAX, `עד ${SAVED_FILTER_NAME_MAX} תווים`),
  color: z.enum(SAVED_FILTER_COLORS.map((c) => c.key) as [string, ...string[]]),
  query: z.string().max(2000),
  scope: z.enum(["me", "everyone"]),
});

export async function saveFilterAction(raw: unknown): Promise<{ message?: string; ok?: boolean }> {
  const ctx = await getTenantContext();
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "הפרטים לא תקינים" };
  const input = parsed.data;
  if (!canReadArea(ctx, AREA[input.list])) return { message: "אין הרשאה לרשימה הזו" };

  const query = normaliseFilterQuery(input.query);
  if (!query) return { message: "אין כרגע סינון לשמור — צריך לבחור קודם מה לסנן." };

  await data.createSavedFilter(ctx.businessId, {
    list: input.list,
    name: input.name,
    color: input.color,
    query,
    ownerId: input.scope === "me" ? ctx.userId : null,
    createdBy: ctx.userId,
  });
  revalidatePath(PATH[input.list]);
  return { ok: true };
}

const updateSchema = schema.omit({ list: true, query: true }).extend({
  id: z.string().min(1),
  /** Set to also replace what the button filters by with what is on screen. */
  query: z.string().max(2000).optional(),
});

/**
 * Renames, recolours or re-scopes a button — and, when asked, points it at
 * the filter on screen now (08/11/2026: "בחירה ועריכה"). The same people who
 * may delete it may change it.
 */
export async function updateSavedFilterAction(
  raw: unknown,
): Promise<{ message?: string; ok?: boolean }> {
  const ctx = await getTenantContext();
  const parsed = updateSchema.safeParse(raw);
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "הפרטים לא תקינים" };
  const input = parsed.data;
  const row = await data.getSavedFilter(ctx.businessId, input.id);
  if (!row || (row.owner_id && row.owner_id !== ctx.userId)) return { message: "לא נמצא" };
  const mine = row.owner_id === ctx.userId || row.created_by === ctx.userId;
  const admin = ctx.role === "admin" || ctx.isSuperAdmin;
  if (!mine && !admin) return { message: "רק מי שיצר את הכפתור או מנהל יכולים לשנות אותו" };

  const query = input.query ? normaliseFilterQuery(input.query) : undefined;
  if (input.query !== undefined && !query) return { message: "אין כרגע סינון על המסך." };

  await data.updateSavedFilter(ctx.businessId, row.id, {
    name: input.name,
    color: input.color,
    ownerId: input.scope === "me" ? ctx.userId : null,
    query,
  });
  const list = row.list as SavedFilterList;
  if (PATH[list]) revalidatePath(PATH[list]);
  return { ok: true };
}

/**
 * A personal button is its owner's to delete. A shared one, its creator's or
 * an admin's — somebody else's colleague cannot make it vanish from the whole
 * office by accident.
 */
export async function deleteSavedFilterAction(id: string): Promise<{ message?: string }> {
  const ctx = await getTenantContext();
  const parsed = z.string().min(1).safeParse(id);
  if (!parsed.success) return { message: "לא נמצא" };
  const row = await data.getSavedFilter(ctx.businessId, parsed.data);
  if (!row) return {};
  const mine = row.owner_id === ctx.userId || row.created_by === ctx.userId;
  const admin = ctx.role === "admin" || ctx.isSuperAdmin;
  if (row.owner_id && row.owner_id !== ctx.userId) return { message: "לא נמצא" };
  if (!mine && !admin) return { message: "רק מי שיצר את הכפתור או מנהל יכולים להסיר אותו" };

  await data.deleteSavedFilter(ctx.businessId, row.id);
  const list = row.list as SavedFilterList;
  if (PATH[list]) revalidatePath(PATH[list]);
  return {};
}
