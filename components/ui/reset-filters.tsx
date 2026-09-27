import Link from "next/link";
import { RotateCcw } from "lucide-react";

/**
 * "איפוס סינון" — on every screen that filters (the user, 27/09/2026).
 *
 * Always in the same place in the filter row and always worded the same, so
 * it is found without looking. Present even when nothing is filtered, as a
 * quiet disabled label: a control that appears and disappears is one people
 * learn not to rely on. A plain link to the bare address — the URL is the
 * whole state on every list, so "reset" is "go to the page with no query".
 */
export function ResetFilters({
  href,
  active,
  testId = "reset-filters",
}: {
  /** The screen with nothing filtered. */
  href: string;
  /** Anything is filtered right now. */
  active: boolean;
  testId?: string;
}) {
  const body = (
    <>
      <RotateCcw className="size-4" aria-hidden />
      איפוס סינון
    </>
  );
  const base = "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium";
  return active ? (
    <Link
      href={href}
      scroll={false}
      data-testid={testId}
      className={`${base} text-on-surface ring-1 ring-outline-variant hover:bg-surface-container`}
    >
      {body}
    </Link>
  ) : (
    <span aria-disabled="true" data-testid={testId} className={`${base} text-outline`}>
      {body}
    </span>
  );
}
