import { formatMoney } from "./format";

/**
 * The audit delta, as a sentence (US-010 AC-5).
 *
 * Reads the two JSON blobs the log already holds rather than storing a second,
 * human-readable copy — one of them would eventually be the one that is wrong.
 */
export function describeDelta(oldValue: unknown, newValue: unknown): string {
  const before = (oldValue ?? {}) as Record<string, unknown>;
  const after = (newValue ?? {}) as Record<string, unknown>;

  // Phrased as nouns rather than verbs on purpose: Hebrew verbs carry gender,
  // the line already names the person, and "רשם" under a woman's name is the
  // product telling her she is somebody else.
  // A CREATION is `old: null` — both shapes of it. Keyed on that rather than on
  // a field only one shape carries: the split path writes no `payment_id` (it
  // creates several rows, not one), and sniffing for that field sent every
  // split down the "update" branch, which then compared its amount against a
  // missing old value and printed "עדכון סכום ₪0.00 ← ₪300.00".
  if (oldValue === null) {
    const amount = formatMoney(Number(after["amount"] ?? 0));
    const across = Number(after["split_across"] ?? 0);
    const credit = Number(after["credit"] ?? 0);
    if (across > 1) {
      return credit > 0
        ? `רישום תשלום של ${amount}, מפוצל בין ${across} הזמנות ועוד ${formatMoney(credit)} ליתרה`
        : `רישום תשלום של ${amount}, מפוצל בין ${across} הזמנות`;
    }
    return credit > 0 && across === 0
      ? `רישום תשלום של ${amount} ליתרת הלקוח`
      : `רישום תשלום של ${amount}`;
  }
  if (after["credit_applied"] !== undefined) {
    return `שיוך ${formatMoney(Number(after["credit_applied"] ?? 0))} מיתרת הלקוח להזמנה`;
  }
  if (typeof after["status"] === "string") {
    return after["status"] === "canceled" ? "ביטול רישום תשלום" : "החזרת רישום שבוטל";
  }

  const parts: string[] = [];
  if (before["amount"] !== after["amount"]) {
    parts.push(
      `סכום ${formatMoney(Number(before["amount"] ?? 0))} ← ${formatMoney(Number(after["amount"] ?? 0))}`,
    );
  }
  if (before["payment_date"] !== after["payment_date"]) {
    parts.push(
      `תאריך ${String(before["payment_date"] ?? "—")} ← ${String(after["payment_date"] ?? "—")}`,
    );
  }
  if (before["external_invoice_number"] !== after["external_invoice_number"]) {
    parts.push(
      `חשבונית ${String(before["external_invoice_number"] ?? "—")} ← ${String(after["external_invoice_number"] ?? "—")}`,
    );
  }
  if (before["order_id"] !== after["order_id"]) parts.push("שיוך מחדש להזמנה אחרת");
  return parts.length > 0 ? `עדכון ${parts.join(" · ")}` : "עדכון רישום תשלום";
}
