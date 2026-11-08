/**
 * Saved filters — a filter kept as a button on a list (user, 08/11/2026).
 * Pure module — no Prisma, no React (conventions.md §9).
 */

/** The lists a filter can be saved on. */
export const SAVED_FILTER_LISTS = ["orders", "publications"] as const;
export type SavedFilterList = (typeof SAVED_FILTER_LISTS)[number];

/**
 * The colours a button may take — names of the product's own status tones, so
 * an admin re-colouring the theme re-colours these too, and no component holds
 * a colour value (CLAUDE.md).
 */
export const SAVED_FILTER_COLORS = [
  { key: "info", label: "כחול" },
  { key: "success", label: "ירוק" },
  { key: "warning", label: "כתום" },
  { key: "error", label: "אדום" },
  { key: "accent", label: "סגול" },
  { key: "neutral", label: "אפור" },
] as const;
export type SavedFilterColor = (typeof SAVED_FILTER_COLORS)[number]["key"];

export const SAVED_FILTER_NAME_MAX = 40;

/** Parameters that say where in the list one is, not what the list is. */
const NOT_A_FILTER = new Set(["page", "size"]);

/**
 * The query a filter is saved and compared as: no paging, empty values and
 * "all" dropped, keys sorted — so the same filter reached two ways is one.
 */
export function normaliseFilterQuery(query: string): string {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const kept = [...params.entries()]
    .filter(([k, v]) => !NOT_A_FILTER.has(k) && v !== "" && v !== "all")
    .sort(([a], [b]) => a.localeCompare(b));
  return new URLSearchParams(kept).toString();
}
