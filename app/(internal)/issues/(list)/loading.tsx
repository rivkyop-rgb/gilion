import { LoadingState } from "@/components/states";

/**
 * Scoped to the list alone, by way of the `(list)` route group.
 *
 * A loading.tsx applies to its segment AND every child of it, and streaming it
 * sends a 200 before the page body runs — so a `notFound()` further down can no
 * longer change the status. Sitting one level up, this file turned
 * /issues/<id belonging to another business>/board into a 200 carrying a 404
 * page. The same lesson is recorded in docs/plan/02-customers.md §deviation 1
 * and was applied to every other list; issues was missed until 23/09/2026.
 */
export default function Loading() {
  return <LoadingState rows={6} />;
}
