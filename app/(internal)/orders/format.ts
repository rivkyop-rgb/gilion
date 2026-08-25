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

/** Orders are addressed by a readable prefix of their cuid, never by row number. */
export const orderNumber = (id: string) => `ORD-${id.slice(-6).toUpperCase()}`;
