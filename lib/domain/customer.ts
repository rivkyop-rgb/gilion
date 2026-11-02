/**
 * Customer validation (US-002).
 *
 * Pure module: no Prisma, no React (conventions.md §9). Everything here is
 * enforced on the server; the client form re-uses it only to render friendlier
 * messages, never as the security boundary.
 */

import { counted } from "./hebrew-count";

/**
 * A customer is a BUSINESS: its name, its own phone and email, an optional
 * ח.פ / ע.מ, and the people at it as `contacts`. Until 23/09/2026 there were
 * two types — `regular` (a business) and `casual` (one person) — and the user
 * decided every customer is a business; the migration moved each old contact
 * person to the head of the contacts list.
 */
export type CustomerInput = {
  businessName: string;
  taxId?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  /** The page number this advertiser normally runs on — empty for none. */
  preferredPage?: string | null;
  /** The people at the business, in the order entered; the first is the main one. */
  contacts?: ContactInput[];
};

export type ContactInput = {
  name: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  /** The reminders tick from the card. Carried through an edit, which
      replaces the rows — without it every save would untick everyone. */
  receivesReminders?: boolean;
  /** Ticked for tear sheets (the user, 31/10/2026). */
  receivesTearSheets?: boolean;
  /** Ticked as the one to call about money owed. */
  receivesBilling?: boolean;
};

export const NOTES_MAX = 2000;
export const CONTACTS_MAX = 20;

export type FieldError = { field: keyof CustomerInput; message: string };

/** Israeli numbers: 9–10 digits once separators are removed. */
const PHONE_DIGITS = /^\d{9,10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Strips spaces, hyphens, parentheses and a leading +972 so that
 * "052-123-4567", "052 1234567" and "+972521234567" all store identically.
 * Returns null for an empty input.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+972")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("972") && digits.length > 10) digits = `0${digits.slice(3)}`;
  return digits.length === 0 ? null : digits;
}

export function normalizeEmail(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

/** ח.פ / ע.מ as stored: digits only. Null for an empty input. */
export function normalizeTaxId(raw: string | null | undefined): string | null {
  const digits = raw?.replace(/[\s\-./]/g, "") ?? "";
  return digits === "" ? null : digits;
}

const TAX_ID = /^\d{9}$/;

/** Returns every problem at once, so the form can mark all bad fields in one pass. */
export function validateCustomer(input: CustomerInput): FieldError[] {
  const errors: FieldError[] = [];

  const businessName = input.businessName?.trim() ?? "";
  const taxId = normalizeTaxId(input.taxId);
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);

  // 1. the business name is always required
  if (!businessName) {
    errors.push({ field: "businessName", message: "שם העסק הוא שדה חובה" });
  }

  // 2. reachable by phone or email
  if (!phone && !email) {
    errors.push({ field: "phone", message: "יש להזין טלפון או מייל של העסק" });
  }

  // 3. ח.פ / ע.מ is optional, but one that is there must be one
  if (taxId && !TAX_ID.test(taxId)) {
    errors.push({ field: "taxId", message: "ח.פ / ע.מ צריך להיות 9 ספרות" });
  }

  // 3א. a fixed page is a page number, when one is given
  if (input.preferredPage?.trim() && parsePageNumber(input.preferredPage) === null) {
    errors.push({ field: "preferredPage", message: "מספר עמוד צריך להיות מספר שלם, 1 ומעלה" });
  }

  // 4. phone format, only when one was supplied
  if (phone && !PHONE_DIGITS.test(phone)) {
    errors.push({ field: "phone", message: "מספר טלפון לא תקין — יש להזין 9 או 10 ספרות" });
  }

  // 5. email format, only when one was supplied
  if (email && !EMAIL.test(email)) {
    errors.push({ field: "email", message: "כתובת מייל לא תקינה" });
  }

  if ((input.notes?.length ?? 0) > NOTES_MAX) {
    errors.push({ field: "notes", message: `ההערות ארוכות מדי — עד ${NOTES_MAX} תווים` });
  }

  // 6. contacts. A row left completely blank is dropped, not
  //    refused: "הוספת איש קשר" pressed once too often is not an error.
  const contacts = (input.contacts ?? []).filter((c) => !isBlankContact(c));
  if (contacts.length > CONTACTS_MAX) {
    errors.push({ field: "contacts", message: `עד ${CONTACTS_MAX} אנשי קשר` });
  }
  contacts.forEach((c, i) => {
    const which = `באיש הקשר ה־${i + 1}`;
    const phone = normalizePhone(c.phone);
    const email = normalizeEmail(c.email);
    if (!c.name.trim()) {
      errors.push({ field: "contacts", message: `חסר שם ${which}` });
    } else if (phone && !PHONE_DIGITS.test(phone)) {
      errors.push({ field: "contacts", message: `מספר טלפון לא תקין ${which}` });
    } else if (email && !EMAIL.test(email)) {
      errors.push({ field: "contacts", message: `כתובת מייל לא תקינה ${which}` });
    }
  });

  return errors;
}

function isBlankContact(c: ContactInput): boolean {
  return !c.name.trim() && !c.role?.trim() && !c.phone?.trim() && !c.email?.trim();
}

/** Contacts as stored: blank rows dropped, the rest normalised and numbered. */
export function contactsToStorage(contacts: ContactInput[] | undefined) {
  return (contacts ?? [])
    .filter((c) => !isBlankContact(c))
    .map((c, position) => ({
      name: c.name.trim(),
      role: c.role?.trim() || null,
      phone: normalizePhone(c.phone),
      email: normalizeEmail(c.email),
      receives_reminders: c.receivesReminders ?? false,
      receives_tear_sheets: c.receivesTearSheets ?? false,
      receives_billing: c.receivesBilling ?? false,
      position,
    }));
}

/** The normalised shape that reaches the database. */
export function toStorage(input: CustomerInput) {
  return {
    business_name: input.businessName.trim(),
    tax_id: normalizeTaxId(input.taxId),
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
    notes: input.notes?.trim() || null,
    preferred_page: parsePageNumber(input.preferredPage),
  };
}

/** "5" → 5; empty, zero or anything else → null. */
export function parsePageNumber(raw: string | null | undefined): number | null {
  const t = raw?.trim() ?? "";
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 ? n : null;
}

/**
 * Blocking message for a delete attempt on a customer with history (rule 8).
 *
 * Each noun is a singular/plural pair rather than one word after a digit:
 * "1 הזמנות" is not Hebrew, and a customer with exactly one order is precisely
 * the customer someone tries to delete (lib/domain/hebrew-count.ts).
 */
export function deletionBlockedMessage(counts: Record<string, number>): string | null {
  const labels: Record<string, [one: string, many: string]> = {
    orders: ["הזמנה אחת", "הזמנות"],
    publications: ["פרסום אחד", "פרסומים"],
    advertisements: ["מודעה אחת", "מודעות"],
    payments: ["רישום תשלום אחד", "רישומי תשלום"],
    portalUsers: ["משתמש פורטל אחד", "משתמשי פורטל"],
  };

  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => {
      const pair = labels[key];
      return pair ? counted(n, pair[0], pair[1]) : `${n} ${key}`;
    });

  if (parts.length === 0) return null;
  return `לא ניתן למחוק את הלקוח — יש לו ${parts.join(", ")}. לקוח עם היסטוריה נשמר במערכת.`;
}
