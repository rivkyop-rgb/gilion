/**
 * Reading and writing the admin panel's settings (stage 11).
 *
 * Tenant-scoped like everything else in lib/data (conventions.md §2). The row
 * is created lazily rather than by a migration or a trigger on business
 * creation: a business that has never opened the panel has no row and reads
 * exactly the same defaults as one that opened it and changed nothing, so
 * "unset" and "set to today's default" never become two different states.
 */
import type { Prisma } from "@prisma/client";

import { basePrisma, tenantDb } from "./db";
import type { ColorOverrides } from "@/lib/domain/theme-tokens";
import {
  DEFAULT_CURRENCY,
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIMEZONE,
  type BrandSlot,
  type TextOverrides,
} from "@/lib/domain/business-settings";

/** What every consumer receives, whether or not a row exists. */
export type BusinessSettings = {
  displayName: string | null;
  tagline: string | null;
  markFileKey: string | null;
  logoFullFileKey: string | null;
  faviconFileKey: string | null;
  colors: ColorOverrides;
  texts: TextOverrides;
  contactPhone: string | null;
  contactEmail: string | null;
  contactAddress: string | null;
  timezone: string;
  dateFormat: string;
  currency: string;
};

/**
 * The answer for a business with no row.
 *
 * A real object rather than null, so no caller has to branch: the layout that
 * injects colours, the component that resolves the logo and the PDF footer all
 * read the same shape either way.
 */
export const UNSET: BusinessSettings = {
  displayName: null,
  tagline: null,
  markFileKey: null,
  logoFullFileKey: null,
  faviconFileKey: null,
  colors: {},
  texts: {},
  contactPhone: null,
  contactEmail: null,
  contactAddress: null,
  timezone: DEFAULT_TIMEZONE,
  dateFormat: DEFAULT_DATE_FORMAT,
  currency: DEFAULT_CURRENCY,
};

/** Json from the database is `unknown` shaped; anything not a flat map is dropped. */
function readMap<T extends Record<string, string>>(value: Prisma.JsonValue | null): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {} as T;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry;
  }
  return out as T;
}

type Row = {
  display_name: string | null;
  tagline: string | null;
  mark_file_key: string | null;
  logo_full_file_key: string | null;
  favicon_file_key: string | null;
  color_overrides: Prisma.JsonValue | null;
  text_overrides: Prisma.JsonValue | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_address: string | null;
  timezone: string;
  date_format: string;
  currency: string;
};

function toSettings(row: Row): BusinessSettings {
  return {
    displayName: row.display_name,
    tagline: row.tagline,
    markFileKey: row.mark_file_key,
    logoFullFileKey: row.logo_full_file_key,
    faviconFileKey: row.favicon_file_key,
    colors: readMap<ColorOverrides>(row.color_overrides),
    texts: readMap<Record<string, string>>(row.text_overrides) as TextOverrides,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    contactAddress: row.contact_address,
    timezone: row.timezone,
    dateFormat: row.date_format,
    currency: row.currency,
  };
}

/**
 * Read-only, and it does NOT create the row.
 *
 * This runs in the layout of every internal page, so it has to be a plain
 * SELECT: writing on a GET would turn a page view into a database write for
 * every visitor, and a lazy insert racing itself across two tabs would hit the
 * unique index for no gain at all.
 */
export async function loadSettings(businessId: string): Promise<BusinessSettings> {
  const row = await tenantDb(businessId).businessSettings.findUnique({
    where: { business_id: businessId },
  });
  return row ? toSettings(row) : UNSET;
}

/**
 * The row, created if it is not there yet. Only the write paths call this.
 *
 * `upsert` rather than find-then-create: two admins saving at the same moment
 * would otherwise both find nothing and both insert.
 */
export async function ensureSettings(businessId: string) {
  // `create: {}` is complete at runtime — the extension injects business_id
  // into every create on a direct tenant model (conventions.md §2) — but the
  // generated type cannot know that, which is what the cast says.
  return tenantDb(businessId).businessSettings.upsert({
    where: { business_id: businessId },
    create: {} as never,
    update: {},
  });
}

export type SettingsPatch = {
  display_name?: string | null;
  tagline?: string | null;
  /**
   * Always an object, never SQL NULL. An empty map already means "no
   * overrides", so a nullable column with two empty states would be two ways
   * to say the same thing — and the reader would have to handle both.
   */
  color_overrides?: Prisma.InputJsonValue;
  text_overrides?: Prisma.InputJsonValue;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_address?: string | null;
  timezone?: string;
  date_format?: string;
  currency?: string;
};

/**
 * Applies a patch inside a caller-supplied transaction.
 *
 * Every write in this stage goes through withAudit (conventions.md §6), which
 * hands its callback the transaction client — so the update and its audit row
 * commit together or not at all. That is why this takes `tx` instead of
 * reaching for the scoped client itself.
 *
 * The tenant filter is written out by hand here for the same reason: `tx` is
 * the BASE client, so nothing injects business_id for it. Every where-clause in
 * this file names it explicitly.
 */
export async function applyPatch(
  tx: Prisma.TransactionClient,
  businessId: string,
  patch: SettingsPatch,
) {
  await tx.businessSettings.upsert({
    where: { business_id: businessId },
    create: { business_id: businessId, ...patch },
    update: patch,
  });
}

const SLOT_COLUMN: Record<BrandSlot, "mark_file_key" | "logo_full_file_key" | "favicon_file_key"> =
  {
    mark: "mark_file_key",
    logo_full: "logo_full_file_key",
    favicon: "favicon_file_key",
  };

/** Sets or clears one brand asset. `null` sends the slot back to the shipped file. */
export async function setBrandAsset(
  tx: Prisma.TransactionClient,
  businessId: string,
  slot: BrandSlot,
  key: string | null,
) {
  const column = SLOT_COLUMN[slot];
  await tx.businessSettings.upsert({
    where: { business_id: businessId },
    create: { business_id: businessId, [column]: key },
    update: { [column]: key },
  });
}

/** The keys this business currently points at — the route checks against this. */
export async function brandKeysFor(businessId: string): Promise<string[]> {
  const row = await basePrisma.businessSettings.findUnique({
    where: { business_id: businessId },
    select: { mark_file_key: true, logo_full_file_key: true, favicon_file_key: true },
  });
  if (!row) return [];
  return [row.mark_file_key, row.logo_full_file_key, row.favicon_file_key].filter(
    (k): k is string => typeof k === "string" && k.length > 0,
  );
}

/** The business's own name, for the display-name fallback. */
export async function businessName(businessId: string): Promise<string> {
  const row = await basePrisma.business.findUnique({
    where: { id: businessId },
    select: { name: true },
  });
  return row?.name ?? "";
}

/**
 * The branding for a screen that has no session yet — /login.
 *
 * There is no tenant before someone signs in, so "whose logo" has no answer in
 * general. It has exactly one answer when the installation holds a single
 * active business, and that is the case this returns settings for; with two or
 * more it falls back to the shipped brand rather than picking one business's
 * identity to greet the other's staff with.
 *
 * Unscoped on purpose — there is no business to scope to. It reads nothing but
 * branding, which is the one thing on a settings row that is meant to be seen
 * before anyone has proved who they are.
 */
export async function loadLoginBrand(): Promise<BusinessSettings> {
  const businesses = await basePrisma.business.findMany({
    where: { status: "active" },
    select: { id: true },
    take: 2,
  });
  if (businesses.length !== 1) return UNSET;

  const row = await basePrisma.businessSettings.findUnique({
    where: { business_id: businesses[0]!.id },
  });
  return row ? toSettings(row) : UNSET;
}

/**
 * The brand keys that /login is allowed to render before anyone has signed in.
 *
 * This is a deliberate, narrow hole in the rule that app/api/files serves
 * nothing without a session, and it is worth stating plainly rather than
 * burying: a logo on a login page is public by construction — it is shown to
 * every visitor who reaches the URL, which is the whole reason to put it there.
 * Nothing else is reachable this way. The list is the two or three keys this
 * one business currently points at, so a guessed key still serves nothing, and
 * an installation with more than one business returns an empty list and shows
 * the shipped brand instead.
 */
export async function loginBrandKeys(): Promise<string[]> {
  const businesses = await basePrisma.business.findMany({
    where: { status: "active" },
    select: { id: true },
    take: 2,
  });
  if (businesses.length !== 1) return [];
  return brandKeysFor(businesses[0]!.id);
}
