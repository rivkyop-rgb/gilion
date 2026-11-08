/**
 * Page types in the order a newspaper is read: front, inner, back (08/11/2026).
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The database sorts by Hebrew name, which happens to give "גב, פנימי, שער" —
 * back first, front last. Every list of page types goes through this instead.
 * A type with another name sits between the inner pages and the back, by name.
 */
function rank(name: string): number {
  const n = name.trim();
  if (n.startsWith("שער")) return 0;
  if (n.startsWith("פנימי")) return 1;
  if (n.startsWith("גב")) return 3;
  return 2;
}

export function byReadingOrder<T extends { name: string }>(a: T, b: T): number {
  return rank(a.name) - rank(b.name) || a.name.localeCompare(b.name, "he");
}

/** Sorts `page_types` on each row in place-free fashion and returns the rows. */
export function withPageTypesInOrder<R extends { page_types: { name: string }[] }>(row: R): R {
  return { ...row, page_types: [...row.page_types].sort(byReadingOrder) };
}
