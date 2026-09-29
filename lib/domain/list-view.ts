/**
 * Paging, page size and search, for a list that outgrew its screen (US-002).
 *
 * Pure module — no Prisma, no React (conventions.md §9).
 *
 * The customer card holds five lists, and every one of them grows for as long
 * as the customer keeps buying. Until now each was capped — orders, publications
 * and files at 100 rows, payments at 200 — and the cap was SILENT: a customer
 * of five years simply stopped having older rows, with nothing on screen
 * admitting it. A truncated list that does not say it is truncated is worse
 * than a long one, because it reads as a complete answer.
 *
 * So the parameters live in the URL rather than in component state: a page of
 * results somebody is looking at is a thing they send to a colleague, and a
 * reload has to land on the same rows. It is also what lets the CSV export
 * apply exactly the search the screen is showing.
 */

/** What the size control offers. The user asked for the last three. */
export const PAGE_SIZES = [10, 50, 70, 100] as const;

/**
 * Small on purpose: the brief was "show only the recent ones by default".
 * Anyone who wants the long view says so once and the URL remembers it.
 */
export const DEFAULT_PAGE_SIZE = 10;

export type ListParams = { page: number; size: number; q: string };

export type RawListParams = {
  page?: string | undefined;
  size?: string | undefined;
  q?: string | undefined;
};

/**
 * Reads one section's parameters off the query string.
 *
 * Every value is clamped rather than rejected. These arrive from a URL somebody
 * may have typed or edited, and a hand-edited `size=99999` should quietly
 * become the biggest allowed page — not a 500, and not a query that tries to
 * read a hundred thousand rows.
 */
export function parseListParams(raw: RawListParams = {}): ListParams {
  const size = Number(raw.size);
  const page = Number(raw.page);

  return {
    size: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_PAGE_SIZE,
    page: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    q: (raw.q ?? "").trim(),
  };
}

/** How many rows to skip. Derived rather than stored, so the two cannot drift. */
export function skipFor(params: ListParams): number {
  return (params.page - 1) * params.size;
}

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

/**
 * A page that ran off the end of the list.
 *
 * Happens for real: somebody is on page 7, deletes rows or types a search, and
 * the list is now three pages long. The answer is to show the last page that
 * exists rather than an empty table that looks like "no results".
 */
export function clampPage(params: ListParams, total: number): ListParams {
  const last = pageCount(total, params.size);
  return params.page > last ? { ...params, page: last } : params;
}

/** `21–30 מתוך 84` — what the pager says about where you are. */
export function rangeLabel(params: ListParams, total: number): string {
  if (total === 0) return "אין תוצאות";
  const from = skipFor(params) + 1;
  const to = Math.min(total, from + params.size - 1);
  return from === to ? `${from} מתוך ${total}` : `${from}–${to} מתוך ${total}`;
}

/**
 * The order number somebody typed, as a number.
 *
 * Orders are shown as `ORD-0042` (orders/format.ts), and a person searching
 * types what they are reading — with the prefix, with the padding, or neither.
 * All three have to find the same order, so the prefix and the zeros come off
 * and what is left is matched numerically.
 *
 * `null` for anything that is not a number, which is how the caller knows to
 * search the text columns only rather than to match order 0.
 */
export function orderNumberNeedle(q: string): number | null {
  const digits = q
    .trim()
    .replace(/^ord[-\s]?/i, "")
    .replace(/^0+/, "");
  if (digits === "" || !/^\d+$/.test(digits)) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * The page's own URL with one list's page/size/q taken off — what the toolbar
 * writes its three parameters back onto, so every filter the page owns
 * survives a page turn. `prefix` as in ListToolbar ("" for a page's one list).
 */
export function baseHrefFor(
  path: string,
  params: Record<string, string | string[] | undefined>,
  prefix = "",
): string {
  const own = new Set(["page", "size", "q"].map((n) => (prefix ? `${prefix}_${n}` : n)));
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (own.has(k) || v === undefined) continue;
    for (const one of Array.isArray(v) ? v : [v]) if (one !== "") qs.append(k, one);
  }
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
