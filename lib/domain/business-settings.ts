/**
 * Everything else an admin may change without a developer (stage 11).
 *
 * Colours live in theme-tokens.ts; this module holds the other three groups —
 * the texts users read, the operational settings, and the rules a brand asset
 * has to pass before it is stored.
 *
 * The shape is the same one the permission matrix and the palette already use:
 * a SPARSE map of overrides, where a missing key means "the default". Storing
 * the default instead would freeze today's wording into the business forever,
 * so a later correction to the default would silently skip every business that
 * had once opened the screen and pressed save.
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 */

import { normalizeEmail, normalizePhone } from "./customer";

/* --------------------------------------------------------------------- texts */

export type TextKey =
  "login_title" | "login_subtitle" | "portal_intro" | "pdf_footer" | "reminder_template";

export type TextField = {
  key: TextKey;
  label: string;
  /** What the product says when the business has not overridden it. */
  default: string;
  /** Where the words actually appear, so the admin is not guessing. */
  where: string;
  multiline?: boolean;
  maxLength: number;
};

export const TEXT_FIELDS: readonly TextField[] = [
  {
    key: "login_title",
    label: "כותרת מסך ההתחברות",
    default: "התחברות למערכת",
    where: "מעל שדות המייל והסיסמה ב־/login",
    maxLength: 60,
  },
  {
    key: "login_subtitle",
    label: "משפט מתחת לכותרת ההתחברות",
    default: "מערכת לניהול פרסום בעיתון",
    where: "שורה אחת מתחת לכותרת ב־/login",
    maxLength: 120,
  },
  {
    key: "portal_intro",
    label: "טקסט פתיחה בפורטל הלקוח",
    default: "כאן אפשר להגיש בקשת פרסום ולהעלות מודעה.",
    where: "ראש מסך הפורטל, לפני טופס הבקשה",
    multiline: true,
    maxLength: 400,
  },
  {
    key: "pdf_footer",
    label: "טקסט תחתית ב־PDF",
    default: "",
    where: "בתחתית כל עמוד בקובץ ההפקה. ריק = בלי תחתית.",
    maxLength: 120,
  },
  {
    key: "reminder_template",
    label: "נוסח ברירת מחדל לתזכורת",
    default: "שלום, טרם קיבלנו את המודעה לפרסום הקרוב. נשמח לקבל אותה בהקדם.",
    where: "מסך התזכורות — הנוסח שמועתק כשפונים ללקוח",
    multiline: true,
    maxLength: 400,
  },
] as const;

export const TEXT_KEYS: readonly TextKey[] = TEXT_FIELDS.map((f) => f.key);

export function textFieldByKey(key: string): TextField | undefined {
  return TEXT_FIELDS.find((f) => f.key === key);
}

export type TextOverrides = Partial<Record<TextKey, string>>;

/** The wording actually in force for one key. */
export function textFor(key: TextKey, overrides: TextOverrides = {}): string {
  const override = overrides[key];
  if (typeof override === "string" && override.trim() !== "") return override;
  return textFieldByKey(key)?.default ?? "";
}

/**
 * Reads a submitted set of texts.
 *
 * An empty field means "back to the default" and is therefore dropped — which
 * is also what makes `pdf_footer` work, whose default is itself empty: there is
 * no way to express "deliberately blank" that differs from "unset", and no
 * reason to want one.
 */
export function readSubmittedTexts(
  submitted: Record<string, string>,
): { overrides: TextOverrides } | { error: string } {
  const overrides: TextOverrides = {};

  for (const [key, raw] of Object.entries(submitted)) {
    const field = textFieldByKey(key);
    if (!field) continue;

    const value = raw.replace(/\r\n/g, "\n").trim();
    if (value === "") continue;

    if (value.length > field.maxLength) {
      return { error: `"${field.label}" ארוך מדי — עד ${field.maxLength} תווים.` };
    }
    if (value !== field.default) overrides[field.key] = value;
  }

  return { overrides };
}

/* ------------------------------------------------------------------- general */

/*
 * ── Time zone, date format and currency were REMOVED on 23/09/2026 ──────────
 *
 * All three were offered here, validated, stored — and read by nothing. Every
 * date in the product is formatted `he-IL` in `Asia/Jerusalem` and every amount
 * in `ILS`, in about a dozen module-level `Intl` formatters, because
 * conventions.md §1 fixes exactly that: storage in UTC, display in Jerusalem,
 * dd/MM/yyyy. The panel was offering three controls that contradicted a
 * cross-cutting decision and changed nothing — and a control that saves and
 * does nothing is worse than no control, because the next person to look reads
 * the screen and believes it.
 *
 * Making them real is not a wiring job: the formatters are module constants
 * imported by client components, so a per-business format needs a request-level
 * context and a pass over every screen that shows money or a date. That is a
 * decision with a cost, and it belongs to whoever decides the product sells
 * outside Israel. Until then the honest screen is one without the fields.
 */

export type GeneralInput = {
  displayName: string;
  tagline: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
};

export type FieldError = { field: keyof GeneralInput; message: string };

/** Every problem at once, so the form can mark all the bad fields in one pass. */
export function validateGeneral(input: GeneralInput): FieldError[] {
  const errors: FieldError[] = [];

  if (input.displayName.trim().length > 80) {
    errors.push({ field: "displayName", message: "שם התצוגה ארוך מדי — עד 80 תווים" });
  }
  if (input.tagline.trim().length > 120) {
    errors.push({ field: "tagline", message: "המשפט המלווה ארוך מדי — עד 120 תווים" });
  }

  // Contact details are OPTIONAL here, unlike on a customer: a business that
  // has not filled them in is a business that has not got to it yet.
  const phone = normalizePhone(input.contactPhone);
  if (phone && !/^\d{7,10}$/.test(phone)) {
    errors.push({ field: "contactPhone", message: "מספר טלפון לא תקין" });
  }

  const email = normalizeEmail(input.contactEmail);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    errors.push({ field: "contactEmail", message: "כתובת מייל לא תקינה" });
  }

  if (input.contactAddress.trim().length > 200) {
    errors.push({ field: "contactAddress", message: "הכתובת ארוכה מדי — עד 200 תווים" });
  }

  return errors;
}

/* -------------------------------------------------------------- brand assets */

export type BrandSlot = "mark" | "logo_full" | "favicon";
export type BrandFileType = "svg" | "png" | "webp" | "ico" | "jpg";

export type BrandSlotSpec = {
  slot: BrandSlot;
  label: string;
  hint: string;
  types: readonly BrandFileType[];
  maxBytes: number;
};

export const BRAND_SLOTS: readonly BrandSlotSpec[] = [
  {
    slot: "mark",
    label: "סימן (מרובע)",
    hint: "מופיע בסרגל הצד ובכל מקום שבו יש מקום לריבוע אחד.",
    types: ["svg", "png", "webp"],
    maxBytes: 2 * 1024 * 1024,
  },
  {
    slot: "logo_full",
    label: "לוגו מלא",
    hint: "השם המלא. מופיע במסך ההתחברות ובראש קובץ ההפקה.",
    types: ["svg", "png", "webp"],
    maxBytes: 2 * 1024 * 1024,
  },
  {
    slot: "favicon",
    label: "Favicon",
    hint: "האייקון בלשונית הדפדפן. ריבועי, קטן, 32×32 ומעלה.",
    types: ["ico", "png", "svg"],
    // A favicon is fetched on every page load and is 32 pixels across. Anything
    // that does not fit in 200KB is the wrong file, not a large one.
    maxBytes: 200 * 1024,
  },
] as const;

export function brandSlotSpec(slot: BrandSlot): BrandSlotSpec {
  return BRAND_SLOTS.find((s) => s.slot === slot)!;
}

/**
 * The type a file IS, decided by its bytes — never by the name it was given.
 *
 * The same rule as ad uploads (lib/domain/ad-file.ts): an extension is
 * something the uploader typed. SVG is the exception that has to be sniffed as
 * text rather than by a signature, because it has none — which is exactly why
 * it is also the one type that then goes through svg-sanitize.ts.
 */
export function sniffBrandType(bytes: Uint8Array): BrandFileType | null {
  const startsWith = (sig: number[], at = 0) =>
    bytes.length >= at + sig.length && sig.every((b, i) => bytes[at + i] === b);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith([0xff, 0xd8, 0xff])) return "jpg";
  // RIFF....WEBP
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8))
    return "webp";
  // The ICO header: reserved 0, type 1, then the image count.
  if (startsWith([0x00, 0x00, 0x01, 0x00])) return "ico";

  // SVG is text. Look only at the head — a large file with a comment preamble
  // still declares itself within the first few hundred bytes.
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 512));
  if (/<\s*svg[\s>]/i.test(head) || /^\s*<\?xml/.test(head)) return "svg";

  return null;
}

export type BrandFileRejection = { message: string };

/** Type and size, in the order that produces the more useful message first. */
export function checkBrandFile(
  slot: BrandSlot,
  bytes: Uint8Array,
): { ok: true; type: BrandFileType } | { ok: false; rejection: BrandFileRejection } {
  const spec = brandSlotSpec(slot);
  const type = sniffBrandType(bytes);

  if (!type || !spec.types.includes(type)) {
    return {
      ok: false,
      rejection: {
        message: `${spec.label}: אפשר להעלות ${spec.types.map((t) => t.toUpperCase()).join(", ")} בלבד.`,
      },
    };
  }

  if (bytes.length > spec.maxBytes) {
    const limit =
      spec.maxBytes >= 1024 * 1024
        ? `${spec.maxBytes / (1024 * 1024)} MB`
        : `${spec.maxBytes / 1024} KB`;
    return { ok: false, rejection: { message: `${spec.label}: הקובץ גדול מ־${limit}.` } };
  }

  return { ok: true, type };
}

/** `{businessId}/brand/{slot}.{ext}` — conventions.md §5. */
export function brandKey(businessId: string, slot: BrandSlot, type: BrandFileType): string {
  return `${businessId}/brand/${slot.replace(/_/g, "-")}.${type}`;
}

/** True for a key this product would serve as a brand asset. Used by the route. */
export function isBrandKey(key: string): boolean {
  const parts = key.split("/");
  return parts.length === 3 && parts[1] === "brand" && /^[a-z-]+\.[a-z]+$/.test(parts[2]!);
}
