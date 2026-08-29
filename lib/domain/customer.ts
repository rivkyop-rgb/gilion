/**
 * Customer validation and conversion rules (US-002).
 *
 * Pure module: no Prisma, no React (conventions.md §9). Everything here is
 * enforced on the server; the client form re-uses it only to render friendlier
 * messages, never as the security boundary.
 */

export type CustomerType = "regular" | "casual";

export type CustomerInput = {
  customerType: CustomerType;
  businessName?: string | null;
  contactName: string;
  phone?: string | null;
  email?: string | null;
};

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

/** Returns every problem at once, so the form can mark all bad fields in one pass. */
export function validateCustomer(input: CustomerInput): FieldError[] {
  const errors: FieldError[] = [];

  const contactName = input.contactName?.trim() ?? "";
  const businessName = input.businessName?.trim() ?? "";
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);

  // 1. contact name is always required
  if (!contactName) {
    errors.push({ field: "contactName", message: "שם איש קשר הוא שדה חובה" });
  }

  // 2. reachable by phone or email — for both customer types
  if (!phone && !email) {
    errors.push({ field: "phone", message: "יש להזין טלפון או כתובת מייל" });
  }

  // 3. a regular customer must carry a business name
  if (input.customerType === "regular" && !businessName) {
    errors.push({ field: "businessName", message: "שם העסק הוא שדה חובה ללקוח קבוע" });
  }

  // 4. phone format, only when one was supplied
  if (phone && !PHONE_DIGITS.test(phone)) {
    errors.push({ field: "phone", message: "מספר טלפון לא תקין — יש להזין 9 או 10 ספרות" });
  }

  // 5. email format, only when one was supplied
  if (email && !EMAIL.test(email)) {
    errors.push({ field: "email", message: "כתובת מייל לא תקינה" });
  }

  return errors;
}

/** The normalised shape that reaches the database. */
export function toStorage(input: CustomerInput) {
  return {
    customer_type: input.customerType,
    business_name:
      input.customerType === "regular"
        ? (input.businessName?.trim() ?? null)
        : input.businessName?.trim() || null,
    contact_name: input.contactName.trim(),
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
  };
}

export class InvalidConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConversionError";
  }
}

/**
 * Conversion is one-way (rule 6) and never touches the id (rule 7) — which is
 * what preserves the customer's whole history, the point of US-002.
 *
 * regular → casual is refused: orders and publications already reference this
 * customer as a business, and downgrading would strip the business name that
 * invoices and reports were produced against.
 */
export function assertConvertible(
  current: CustomerType,
  target: CustomerType,
  businessName: string | null | undefined,
): void {
  if (current === target) {
    throw new InvalidConversionError("הלקוח כבר מסוג זה");
  }
  if (current === "regular" && target === "casual") {
    throw new InvalidConversionError("לא ניתן להפוך לקוח קבוע ללקוח מזדמן");
  }
  if (!businessName?.trim()) {
    throw new InvalidConversionError("כדי להפוך לקוח קבוע יש להזין שם עסק");
  }
}

/** Blocking message for a delete attempt on a customer with history (rule 8). */
export function deletionBlockedMessage(counts: Record<string, number>): string | null {
  const labels: Record<string, string> = {
    orders: "הזמנות",
    publications: "פרסומים",
    advertisements: "מודעות",
    payments: "תשלומים",
    portalUsers: "משתמשי פורטל",
  };

  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} ${labels[key] ?? key}`);

  if (parts.length === 0) return null;
  return `לא ניתן למחוק את הלקוח — יש לו ${parts.join(", ")}. לקוח עם היסטוריה נשמר במערכת.`;
}
