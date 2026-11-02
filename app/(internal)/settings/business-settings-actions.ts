"use server";

import { revalidatePath } from "next/cache";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { withAudit } from "@/lib/data/audit";
import * as data from "@/lib/data/business-settings";
import {
  BRAND_SLOTS,
  brandKey,
  brandSlotSpec,
  readSubmittedTexts,
  TEXT_FIELDS,
  validateGeneral,
  checkBrandFile,
  type BrandSlot,
  type GeneralInput,
} from "@/lib/domain/business-settings";
import { normalizeEmail, normalizePhone } from "@/lib/domain/customer";
import { contrastWarnings, readSubmittedColors, THEME_TOKENS } from "@/lib/domain/theme-tokens";
import { sanitizeSvg } from "@/lib/domain/svg-sanitize";
import { CONTENT_TYPES, putObject } from "@/lib/storage/minio";

export type PanelState = {
  errors?: Record<string, string>;
  message?: string;
  /** Said out loud but never blocking — a low-contrast pair, a stripped SVG. */
  warnings?: string[];
  ok?: boolean;
};

/**
 * The admin panel is admin-only, all four screens (stage 11 §הרשאות).
 *
 * `settings` is the area, and its default matrix cell is write for admin and
 * none for everyone else — so a designer reaching /settings/theme by URL is
 * refused here by the server, not merely hidden from in the menu (FR-8).
 */
async function requireAdmin() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");
  return ctx;
}

/**
 * The settings reach the screen through the internal LAYOUT, which every page
 * shares — so a saved colour has to invalidate the layout and not one route,
 * or the sidebar keeps the old palette until the next hard reload.
 */
function revalidateEverything() {
  revalidatePath("/", "layout");
}

/* --------------------------------------------------------------------- brand */

/** The slot a form field belongs to, e.g. `file_mark` → `mark`. */
const SLOT_OF_FIELD = new Map<string, BrandSlot>(
  BRAND_SLOTS.map((s) => [`file_${s.slot}`, s.slot] as const),
);

export async function updateBrandingAction(
  _prev: PanelState,
  formData: FormData,
): Promise<PanelState> {
  const ctx = await requireAdmin();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const tagline = String(formData.get("tagline") ?? "").trim();

  if (displayName.length > 80) return { errors: { displayName: "עד 80 תווים" } };
  if (tagline.length > 120) return { errors: { tagline: "עד 120 תווים" } };

  const warnings: string[] = [];
  /** slot → key to store, or null to send the slot back to the shipped file. */
  const assetChanges = new Map<BrandSlot, string | null>();

  for (const [field, slot] of SLOT_OF_FIELD) {
    if (formData.get(`clear_${slot}`) === "1") {
      assetChanges.set(slot, null);
      continue;
    }

    const file = formData.get(field);
    if (!(file instanceof File) || file.size === 0) continue;

    let bytes = Buffer.from(await file.arrayBuffer());

    const check = checkBrandFile(slot, bytes);
    if (!check.ok) return { errors: { [field]: check.rejection.message } };

    // SVG is code (lib/domain/svg-sanitize.ts). What gets stored is never the
    // uploaded bytes when anything executable was found in them.
    if (check.type === "svg") {
      const scanned = sanitizeSvg(bytes.toString("utf8"));
      if ("error" in scanned) return { errors: { [field]: scanned.error } };
      if (scanned.removed.length > 0) {
        warnings.push(
          `${brandSlotSpec(slot).label}: הוסר מהקובץ תוכן פעיל לפני השמירה — ${scanned.removed.join(", ")}. הציור עצמו נשמר.`,
        );
      }
      bytes = Buffer.from(scanned.svg, "utf8");
    }

    const key = brandKey(ctx.businessId, slot, check.type);
    await putObject(key, bytes, CONTENT_TYPES[check.type] ?? "application/octet-stream");
    assetChanges.set(slot, key);
  }

  const before = await data.loadSettings(ctx.businessId);

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "update_business_settings", targetType: "Business", targetId: ctx.businessId },
    async (tx) => {
      await data.applyPatch(tx, ctx.businessId, {
        display_name: displayName || null,
        tagline: tagline || null,
      });
      for (const [slot, key] of assetChanges) {
        await data.setBrandAsset(tx, ctx.businessId, slot, key);
      }

      return {
        old: {
          display_name: before.displayName,
          tagline: before.tagline,
          ...Object.fromEntries(
            [...assetChanges.keys()].map((slot) => [slot, brandKeyOf(before, slot)]),
          ),
        },
        new: {
          display_name: displayName || null,
          tagline: tagline || null,
          ...Object.fromEntries(assetChanges),
        },
      };
    },
  );

  revalidateEverything();
  return { ok: true, message: "המותג נשמר", ...(warnings.length ? { warnings } : {}) };
}

function brandKeyOf(settings: data.BusinessSettings, slot: BrandSlot): string | null {
  if (slot === "mark") return settings.markFileKey;
  if (slot === "logo_full") return settings.logoFullFileKey;
  return settings.faviconFileKey;
}

/* --------------------------------------------------------------------- theme */

export async function updateThemeAction(
  _prev: PanelState,
  formData: FormData,
): Promise<PanelState> {
  const ctx = await requireAdmin();

  const submitted: Record<string, string> = {};
  for (const token of THEME_TOKENS) {
    submitted[token.key] = String(formData.get(token.key) ?? "");
  }

  const read = readSubmittedColors(submitted);
  if ("error" in read) return { message: read.error };

  const before = await data.loadSettings(ctx.businessId);

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "update_business_settings", targetType: "Business", targetId: ctx.businessId },
    async (tx) => {
      await data.applyPatch(tx, ctx.businessId, { color_overrides: read.overrides });
      return { old: before.colors, new: read.overrides };
    },
  );

  revalidateEverything();

  // Contrast is a WARNING and never a refusal (stage 11 §כללי ולידציה): it is
  // the admin's own brand. But an unreadable badge is not something anyone
  // picks on purpose, so it is said at the moment of saving rather than never.
  const warnings = contrastWarnings(read.overrides).map((w) => w.message);

  const count = Object.keys(read.overrides).length;
  return {
    ok: true,
    // The number the SERVER holds, not one the form computed — a count derived
    // from client state can be true before the save even left (CLAUDE.md).
    message:
      count === 0
        ? "כל הצבעים חזרו לברירת המחדל"
        : count === 1
          ? "נשמר צבע מותאם אחד"
          : `נשמרו ${count} צבעים מותאמים`,
    ...(warnings.length ? { warnings } : {}),
  };
}

/* --------------------------------------------------------------------- texts */

export async function updateTextsAction(
  _prev: PanelState,
  formData: FormData,
): Promise<PanelState> {
  const ctx = await requireAdmin();

  // Only what this form actually carries. A text edited on its own screen
  // (TEXTS_WITH_OWN_SCREEN) is not on this form, and reading its absence as
  // "empty" would erase it on every save here.
  const submitted: Record<string, string> = {};
  for (const field of TEXT_FIELDS) {
    if (formData.has(field.key)) submitted[field.key] = String(formData.get(field.key) ?? "");
  }

  const parsed = readSubmittedTexts(submitted);
  if ("error" in parsed) return { message: parsed.error };

  const before = await data.loadSettings(ctx.businessId);
  const kept = Object.fromEntries(Object.entries(before.texts).filter(([k]) => !(k in submitted)));
  const read = { overrides: { ...kept, ...parsed.overrides } };

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "update_business_settings", targetType: "Business", targetId: ctx.businessId },
    async (tx) => {
      await data.applyPatch(tx, ctx.businessId, { text_overrides: read.overrides });
      return { old: before.texts, new: read.overrides };
    },
  );

  revalidateEverything();
  const count = Object.keys(read.overrides).length;
  return {
    ok: true,
    message: count === 0 ? "כל הטקסטים חזרו לברירת המחדל" : `נשמרו ${count} טקסטים מותאמים`,
  };
}

/* ------------------------------------------------------------------- general */

export async function updateGeneralAction(
  _prev: PanelState,
  formData: FormData,
): Promise<PanelState> {
  const ctx = await requireAdmin();

  const input: GeneralInput = {
    displayName: String(formData.get("displayName") ?? ""),
    tagline: String(formData.get("tagline") ?? ""),
    contactPhone: String(formData.get("contactPhone") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    contactAddress: String(formData.get("contactAddress") ?? ""),
  };

  const errors = validateGeneral(input);
  if (errors.length) return { errors: Object.fromEntries(errors.map((e) => [e.field, e.message])) };

  const patch = {
    contact_phone: normalizePhone(input.contactPhone),
    contact_email: normalizeEmail(input.contactEmail),
    contact_address: input.contactAddress.trim() || null,
  };

  const before = await data.loadSettings(ctx.businessId);

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "update_business_settings", targetType: "Business", targetId: ctx.businessId },
    async (tx) => {
      await data.applyPatch(tx, ctx.businessId, patch);
      return {
        old: {
          contact_phone: before.contactPhone,
          contact_email: before.contactEmail,
          contact_address: before.contactAddress,
        },
        new: patch,
      };
    },
  );

  revalidateEverything();
  return { ok: true, message: "ההגדרות נשמרו" };
}

/* --------------------------------------------------------------------- reset */

export type ResetGroup = "theme" | "texts" | "branding" | "general";

/**
 * Back to the defaults — one field, or a whole group.
 *
 * Resetting is DELETING the override, never writing the default value into the
 * row: the two look identical today and diverge the moment the default changes,
 * and only one of them keeps following it.
 *
 * Uploaded files are left in the object store when a brand slot is reset. The
 * row stops pointing at them, which is what "back to the default" means on
 * screen; the bytes cost nothing and an admin who resets by accident gets them
 * back by re-uploading rather than by having lost them.
 */
export async function resetSettingAction(group: ResetGroup, key?: string): Promise<PanelState> {
  const ctx = await requireAdmin();

  const before = await data.loadSettings(ctx.businessId);

  await withAudit(
    { businessId: ctx.businessId, userId: ctx.userId },
    { action: "update_business_settings", targetType: "Business", targetId: ctx.businessId },
    async (tx) => {
      if (group === "theme") {
        const next = { ...before.colors };
        if (key) delete next[key];
        const overrides = key ? next : {};
        await data.applyPatch(tx, ctx.businessId, { color_overrides: overrides });
        return { old: before.colors, new: overrides };
      }

      if (group === "texts") {
        const next: Record<string, string> = { ...before.texts };
        if (key) delete next[key];
        const overrides = key ? next : {};
        await data.applyPatch(tx, ctx.businessId, { text_overrides: overrides });
        return { old: before.texts, new: overrides };
      }

      if (group === "branding") {
        const slots = key ? BRAND_SLOTS.filter((s) => s.slot === key) : [...BRAND_SLOTS];
        for (const spec of slots) await data.setBrandAsset(tx, ctx.businessId, spec.slot, null);
        if (!key) await data.applyPatch(tx, ctx.businessId, { display_name: null, tagline: null });
        return {
          old: Object.fromEntries(slots.map((s) => [s.slot, brandKeyOf(before, s.slot)])),
          new: Object.fromEntries(slots.map((s) => [s.slot, null])),
        };
      }

      const patch = {
        contact_phone: null,
        contact_email: null,
        contact_address: null,
      };
      await data.applyPatch(tx, ctx.businessId, patch);
      return {
        old: {
          contact_phone: before.contactPhone,
          contact_email: before.contactEmail,
          contact_address: before.contactAddress,
        },
        new: patch,
      };
    },
  );

  revalidateEverything();
  return { ok: true, message: "הוחזר לברירת המחדל" };
}
