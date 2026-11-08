/**
 * Debt by age — "ותק חובות" (named so 08/11/2026 — the billing table already says "ותק החוב") (08/11/2026, the user chose to add it).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * Counted per PUBLICATION that already ran and is not covered, from its print
 * date — not per customer from their oldest debt. A customer who owes for one
 * week in August and four in November is not ninety days late on all five.
 */
export const AGING_BUCKETS = [
  { key: "0-30", label: "עד 30 יום", max: 30 },
  { key: "31-60", label: "31–60 יום", max: 60 },
  { key: "61-90", label: "61–90 יום", max: 90 },
  { key: "90+", label: "מעל 90 יום", max: Infinity },
] as const;

export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

export type AgingBucket = { key: AgingKey; label: string; amount: number; customers: number };

/** One customer inside a bucket: what they owe there, and from which publications. */
export type AgingCustomer<T> = { customerId: string; amount: number; items: T[] };

const DAY = 24 * 60 * 60 * 1000;

type AgingItem = { customerId: string; date: Date; open: number };

/** Which bucket a print date falls in, counted in whole days. */
export function agingKeyOf(date: Date, today: Date): AgingKey {
  const days = Math.max(0, Math.floor((today.getTime() - date.getTime()) / DAY));
  return AGING_BUCKETS.find((b) => days <= b.max)!.key;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function agingBuckets<T extends AgingItem>(
  items: T[],
  today: Date,
): Array<AgingBucket & { breakdown: AgingCustomer<T>[] }> {
  const byBucket = new Map<AgingKey, Map<string, AgingCustomer<T>>>();
  for (const item of items) {
    if (item.open <= 0.005) continue;
    const key = agingKeyOf(item.date, today);
    const customers = byBucket.get(key) ?? byBucket.set(key, new Map()).get(key)!;
    const entry =
      customers.get(item.customerId) ??
      customers.set(item.customerId, { customerId: item.customerId, amount: 0, items: [] }).get(item.customerId)!;
    entry.amount += item.open;
    entry.items.push(item);
  }
  return AGING_BUCKETS.map((b) => {
    // Largest debt first: the drill-down answers "who do I call", and the
    // first name should be the one worth the call.
    const breakdown = [...(byBucket.get(b.key)?.values() ?? [])]
      .map((c) => ({
        ...c,
        amount: round(c.amount),
        items: [...c.items].sort((x, y) => x.date.getTime() - y.date.getTime()),
      }))
      .sort((x, y) => y.amount - x.amount);
    return {
      key: b.key,
      label: b.label,
      amount: round(breakdown.reduce((sum, c) => sum + c.amount, 0)),
      customers: breakdown.length,
      breakdown,
    };
  });
}
