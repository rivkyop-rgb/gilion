/** Shared formatting for orders and publications — conventions.md §1. */

const DATE = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeZone: "Asia/Jerusalem",
});

const MONEY = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

export const formatDate = (d: Date) => DATE.format(d);
export const formatMoney = (n: number) => MONEY.format(n);

/**
 * The number people say out loud: `ORD-0042`.
 *
 * Until 16/09/2026 this sliced the last six characters off the order's cuid,
 * and the comment here said orders were addressed that way "never by row
 * number". That was a convention with nothing behind it, and it produced a
 * different-looking token per order — plus, on a seeded fixture whose id was
 * written by hand, the word `ORD-IXTURE`. A reference somebody reads down the
 * phone has to count, so `AdOrder.number` is a real per-business sequence.
 *
 * Padded to four so the column lines up in a table and sorts as text for the
 * first ten thousand; past that it simply grows rather than truncating.
 */
export const orderNumber = (n: number) => `ORD-${String(n).padStart(4, "0")}`;
