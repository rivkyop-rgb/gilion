"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  pageCount,
  rangeLabel,
  type ListParams,
} from "@/lib/domain/list-view";
import { cn } from "@/lib/utils";

/**
 * Search, page size and export above a table, and where-am-I plus paging
 * below it — the same two bars on every table in the product (user's
 * decision, 29/09/2026).
 *
 * The state they change is the URL — that is what lets a reload, a shared
 * link and the CSV export all agree about which rows are being looked at.
 *
 * The navigation is done here, with `scroll: false`. A native GET form is a
 * full document load and an App Router `<Link>` scrolls to the top by default;
 * on a customer card with five of these halfway down the page, both threw the
 * reader back to the top on every search and every page turn (16/09/2026).
 *
 * `baseHref` arrives as a STRING and not as a URL-builder function, because a
 * function cannot cross the server/client boundary as a prop. It is the current
 * URL with this section's own three parameters stripped, so everything else on
 * the page — other lists and the page's own filters — survives every move.
 *
 * `prefix` namespaces the parameters when a page holds several lists
 * ("o" → o_page, o_size, o_q). A page with one list passes "" and gets plain
 * page, size and q — the names its own search form already uses.
 */
type ListProps = {
  prefix: string;
  params: ListParams;
  total: number;
  /** This page's URL without this section's page/size/q. */
  baseHref: string;
};

function paramName(prefix: string, name: "page" | "size" | "q") {
  return prefix ? `${prefix}_${name}` : name;
}

/** The test id namespace: the prefix, or "list" for a page's single list. */
function tid(prefix: string) {
  return prefix || "list";
}

/** This section's parameters written back onto the untouched rest of the URL. */
function hrefFor(
  { prefix, params, baseHref }: Omit<ListProps, "total">,
  next: Partial<Pick<ListParams, "page" | "size" | "q">>,
) {
  const merged = { ...params, ...next };
  const url = new URL(baseHref, "http://x");
  // Defaults are left out so a URL that changed nothing stays clean.
  if (merged.q) url.searchParams.set(paramName(prefix, "q"), merged.q);
  else url.searchParams.delete(paramName(prefix, "q"));
  if (merged.size !== DEFAULT_PAGE_SIZE) {
    url.searchParams.set(paramName(prefix, "size"), String(merged.size));
  } else url.searchParams.delete(paramName(prefix, "size"));
  if (merged.page > 1) url.searchParams.set(paramName(prefix, "page"), String(merged.page));
  else url.searchParams.delete(paramName(prefix, "page"));
  return `${url.pathname}${url.search}`;
}

/** The bar above a table: search, rows per page, export. */
export function ListToolbar({
  prefix,
  params,
  baseHref,
  searchLabel,
  exportHref,
  searchable = true,
  children,
}: ListProps & {
  searchLabel?: string;
  /** Omitted when the viewer may not export this list (FR-8). */
  exportHref?: string | undefined;
  /**
   * False when the page already owns a search box for this list — two boxes
   * that search the same rows differently is worse than one.
   */
  searchable?: boolean;
  /** The page's own filters, when they belong on the same line. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const p = tid(prefix);
  /** Every move this toolbar makes keeps the reader where they were. */
  const go = (next: Partial<ListParams>) =>
    router.push(hrefFor({ prefix, params, baseHref }, next), { scroll: false });

  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-3" data-testid={`${p}-toolbar`}>
      <div className="flex flex-wrap items-end gap-2">
        {searchable ? (
          <form
            className="flex items-end gap-1"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get(paramName(prefix, "q"));
              // A new search starts at its own first page; the size is kept,
              // or searching would silently snap back to ten rows.
              go({ q: String(value ?? "").trim(), page: 1 });
            }}
          >
            <div>
              <label className="mb-1 block text-xs text-on-surface-variant" htmlFor={`${p}_q`}>
                {searchLabel ?? "חיפוש"}
              </label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute top-1/2 start-2.5 size-4 -translate-y-1/2 text-outline"
                  aria-hidden
                />
                {/* `key` on the search term: the component survives navigation,
                    so an uncontrolled field would keep the old text after
                    "ניקוי" emptied the URL. Re-mounting on the term keeps the
                    box and the address in step. */}
                <Input
                  key={params.q}
                  id={`${p}_q`}
                  name={paramName(prefix, "q")}
                  defaultValue={params.q}
                  data-testid={`${p}-search`}
                  className="h-9 w-56 ps-8"
                />
              </div>
            </div>
            <Button type="submit" variant="secondary" size="sm" className="h-9" data-testid={`${p}-search-go`}>
              חיפוש
            </Button>
            {params.q ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9"
                data-testid={`${p}-search-clear`}
                onClick={() => go({ q: "", page: 1 })}
              >
                ניקוי
              </Button>
            ) : null}
          </form>
        ) : null}
        {children}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-on-surface-variant" id={`${p}-size-label`}>
          שורות בעמוד
        </span>
        {/* Four choices, all visible: one click to change and nothing to open.
            Changing the size applies at once and returns to the first page. */}
        <div
          role="radiogroup"
          aria-labelledby={`${p}-size-label`}
          data-testid={`${p}-size`}
          data-value={params.size}
          className="flex rounded-lg bg-surface-container p-0.5"
        >
          {PAGE_SIZES.map((n) => {
            const on = n === params.size;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`${p}-size-${n}`}
                onClick={() => (on ? undefined : go({ size: n, page: 1 }))}
                className={cn(
                  "h-7 min-w-10 rounded-md px-2 text-xs tabular-nums transition-colors",
                  on
                    ? "bg-surface-container-lowest font-semibold text-on-surface shadow-elevation-1"
                    : "text-on-surface-variant hover:text-on-surface",
                )}
              >
                {n}
              </button>
            );
          })}
        </div>

        {exportHref ? (
          <Button variant="secondary" size="sm" className="h-9" asChild>
            {/* A plain anchor and NOT a router push: this is a download, and the
                URL carries the same search the table is showing. */}
            <a href={exportHref} data-testid={`${p}-export`}>
              <Download className="size-4" aria-hidden />
              ייצוא
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The bar under a table: which rows these are, and the way to the others.
 *
 * Always rendered, even on a single page: "1–7 מתוך 7" is what tells the
 * reader the list is whole. A list that stops without saying so reads as a
 * complete answer (the `take: 100` lesson in CLAUDE.md).
 */
export function ListPager({ prefix, params, total, baseHref }: ListProps) {
  const p = tid(prefix);
  const last = pageCount(total, params.size);
  const at = (page: number) => hrefFor({ prefix, params, baseHref }, { page });

  return (
    <nav
      aria-label="דפדוף"
      className="mt-2 flex flex-wrap items-center justify-between gap-2"
      data-testid={`${p}-pager`}
    >
      <span className="text-xs text-on-surface-variant" data-testid={`${p}-range`}>
        {rangeLabel(params, total)}
      </span>
      <span className="flex items-center gap-1">
        {/* RTL: ChevronRight points backwards on screen — the previous page. */}
        <PagerLink
          href={at(params.page - 1)}
          disabled={params.page <= 1}
          testId={`${p}-prev`}
          label="עמוד קודם"
        >
          <ChevronRight className="size-4" />
        </PagerLink>
        <span
          className="min-w-14 px-1 text-center text-xs text-on-surface-variant"
          data-testid={`${p}-page`}
        >
          <Ltr>
            {params.page} / {last}
          </Ltr>
        </span>
        <PagerLink
          href={at(params.page + 1)}
          disabled={params.page >= last}
          testId={`${p}-next`}
          label="עמוד הבא"
        >
          <ChevronLeft className="size-4" />
        </PagerLink>
      </span>
    </nav>
  );
}

/**
 * One arrow.
 *
 * `scroll={false}` for the same reason as everything else here. Disabled is a
 * `<span>` and not a dead `<a>`: a link that goes nowhere still looks clickable
 * and still takes focus.
 */
function PagerLink({
  href,
  disabled,
  testId,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  testId: string;
  label: string;
  children: React.ReactNode;
}) {
  const shape =
    "inline-flex size-8 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest";

  if (disabled) {
    return (
      <span
        className={cn(shape, "opacity-40")}
        data-testid={testId}
        aria-disabled="true"
        aria-label={label}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(shape, "text-primary hover:bg-surface-container")}
      data-testid={testId}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
