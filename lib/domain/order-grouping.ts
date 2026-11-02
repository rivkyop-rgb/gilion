/**
 * How an order READS versus how it is stored.
 *
 * One AdOrderItem is one date, because that is what becomes one Publication —
 * the storage is right. But nobody orders "a full page on the 1st" and then "a
 * full page on the 8th"; they order a full page five times. Fifteen identical
 * rows differing only in a date is a table you scan instead of read, and the
 * total at the bottom stops being checkable against what the customer agreed.
 *
 * So the ORDER groups, and the publications list keeps the row-per-date detail
 * (docs/plan/04-orders-publications.md — a display decision, not a model one).
 *
 * Pure module.
 */

export type GroupableLine = {
  id: string;
  newspaperName: string;
  pageTypeName: string;
  shapeName: string;
  publicationDate: string;
  price: number;
  offSchedule: boolean;
  /** A page number asked for on the line — part of WHAT was ordered. */
  requestedPage?: number | null;
};

export type LineGroup = {
  /** Stable across renders: the same combination always yields the same key. */
  key: string;
  newspaperName: string;
  pageTypeName: string;
  shapeName: string;
  requestedPage: number | null;
  unitPrice: number;
  /** The individual dates behind the group, in order. */
  lines: GroupableLine[];
  times: number;
  subtotal: number;
  /** True when at least one date is not a print day for that newspaper. */
  hasOffSchedule: boolean;
};

/**
 * Groups by everything EXCEPT the date — including the price.
 *
 * Price is part of the key on purpose: the same size at two different prices is
 * two different things that were agreed, and collapsing them would hide a
 * discount inside an average nobody asked for.
 */
export function groupOrderLines(lines: GroupableLine[]): LineGroup[] {
  const groups = new Map<string, LineGroup>();

  for (const line of lines) {
    const key = [
      line.newspaperName,
      line.pageTypeName,
      line.shapeName,
      line.price,
      line.requestedPage ?? "",
    ].join("|");
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      existing.times += 1;
      existing.subtotal += line.price;
      existing.hasOffSchedule ||= line.offSchedule;
      continue;
    }
    groups.set(key, {
      key,
      newspaperName: line.newspaperName,
      pageTypeName: line.pageTypeName,
      shapeName: line.shapeName,
      requestedPage: line.requestedPage ?? null,
      unitPrice: line.price,
      lines: [line],
      times: 1,
      subtotal: line.price,
      hasOffSchedule: line.offSchedule,
    });
  }

  return [...groups.values()];
}

/** "×5" reads wrong in Hebrew; this is what the row actually says. */
export function timesLabel(times: number): string {
  if (times === 1) return "פעם אחת";
  if (times === 2) return "פעמיים";
  return `${times} פעמים`;
}
