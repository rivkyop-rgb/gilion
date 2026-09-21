/**
 * What a payment record may contain (US-010, FR-7).
 *
 * Pure module — no Prisma, no React (conventions.md §9). The twelve rules of
 * docs/plan/08-payments-reports.md §כללי ולידציה live in three places by
 * necessity — the ones about shape are here, the ones about tenancy are the
 * Prisma extension's job (conventions.md §2), and the ones about derivation are
 * payment-status.ts. This module owns the first group, and the Server Action
 * runs it in the SERVER before anything is written: client validation is UX and
 * never a security layer (conventions.md §9).
 */

export type PaymentInput = {
  amount: number;
  /** ISO `yyyy-mm-dd`, or empty for "no date recorded". */
  paymentDate: string;
  externalInvoiceNumber: string;
};

/** Longer than any invoice number anyone types, short enough to stay a label. */
export const INVOICE_NUMBER_MAX = 60;

/**
 * Rule 1 — money that arrived is positive.
 *
 * A refund is NOT a negative payment: it is the cancellation of a record that
 * should not have been there. Allowing a negative would give the same fact two
 * spellings, and the sum would stop being auditable against the receipts.
 */
export function validateAmount(amount: number): string | null {
  if (!Number.isFinite(amount)) return "יש להקליד סכום";
  if (amount <= 0) return "הסכום חייב להיות גדול מאפס. לביטול רישום שגוי יש לבטל את הרישום";
  if (amount > 99_999_999) return "הסכום גדול מדי";
  // Two decimals, because that is what a shekel has. Anything finer is a typo.
  if (Math.round(amount * 100) !== Number((amount * 100).toFixed(4)))
    return "הסכום יכול לכלול שתי ספרות אחרי הנקודה";
  return null;
}

/**
 * Rule 3 — a payment cannot have arrived tomorrow.
 *
 * Compared as calendar days in the business's own timezone rather than as
 * instants: "today" typed at 23:00 in Jerusalem is an hour into tomorrow in
 * UTC, and refusing it would read as the form rejecting the current date.
 */
export function validatePaymentDate(iso: string, today = new Date()): string | null {
  if (!iso) return null; // Optional per the ERD.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "תאריך לא תקין";
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "תאריך לא תקין";

  const todayIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(today);
  if (iso > todayIso) return "תאריך תשלום לא יכול להיות בעתיד";
  return null;
}

/**
 * Rule 4 — free text, typed by a person, NOT generated and NOT unique.
 *
 * FR-7 is explicit that the invoice itself is produced elsewhere; this field
 * only records its number. Not unique because one invoice routinely covers
 * several payments, and a uniqueness error on the second one would look like
 * the system refusing a true fact.
 */
export function validateInvoiceNumber(value: string): string | null {
  if (value.length > INVOICE_NUMBER_MAX) return `מספר חשבונית ארוך מ־${INVOICE_NUMBER_MAX} תווים`;
  return null;
}

/** All of the above, in the order a person fills the form. */
export function validatePayment(input: PaymentInput, today = new Date()): string | null {
  return (
    validateAmount(input.amount) ??
    validatePaymentDate(input.paymentDate, today) ??
    validateInvoiceNumber(input.externalInvoiceNumber)
  );
}

/** The two states a record can be in, in Hebrew. */
export const PAYMENT_RECORD_LABELS = { recorded: "נרשם", canceled: "בוטל" } as const;

/** `תשלום אחד` · `3 תשלומים` — same agreement problem as everywhere else. */
export function paymentsPhrase(n: number): string {
  return n === 1 ? "תשלום אחד" : `${n} תשלומים`;
}
