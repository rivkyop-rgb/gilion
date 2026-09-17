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
 * Search, page size, paging and export, for one list among several on a page.
 *
 * The state it changes is still the URL — that is what lets a reload, a shared
 * link and the CSV export all agree about which rows are being looked at. What
 * changed on 16/09/2026 is HOW it gets there.
 *
 * It used to be a server component whose controls were plain `<Link>`s and
 * native GET `<form>`s. Both threw the reader back to the top of the page: a
 * native form submit is a full document load, and an App Router `<Link>` scrolls
 * to the top by default. On a customer card with five of these halfway down the
 * page, every search and every page turn meant scrolling back to where you were.
 *
 * So the navigation is done here, with `scroll: false`. Nothing else moved: the
 * URL is still the whole state, and the server still does the paging.
 *
 * `baseHref` arrives as a STRING and not as a URL-builder function, because a
 * function cannot cross the server/client boundary as a prop. It is the current
 * URL with this section's own three parameters stripped, so everything else on
 * the page — the other four lists included — survives every move made here.
 */
export function ListToolbar({
  prefix,
  params,
  total,
  baseHref,
  searchLabel,
  exportHref,
  searchable = true,
}: {
  /** e.g. "o" → o_page, o_size, o_q. */
  prefix: string;
  params: ListParams;
  total: number;
  /** This page's URL without this section's page/size/q. */
  baseHref: string;
  searchLabel: string;
  /** Omitted when the viewer may not export this list (FR-8). */
  exportHref?: string | undefined;
  searchable?: boolean;
}) {
  const router = useRouter();
  const last = pageCount(total, params.size);

  /** This section's parameters written back onto the untouched rest of the URL. */
  const hrefFor = (next: Partial<Pick<ListParams, "page" | "size" | "q">>) => {
    const merged = { ...params, ...next };
    const url = new URL(baseHref, "http://x");
    // Defaults are left out so a URL that changed nothing stays clean.
    if (merged.q) url.searchParams.set(`${prefix}_q`, merged.q);
    if (merged.size !== DEFAULT_PAGE_SIZE) {
      url.searchParams.set(`${prefix}_size`, String(merged.size));
    }
    if (merged.page > 1) url.searchParams.set(`${prefix}_page`, String(merged.page));
    return `${url.pathname}${url.search}`;
  };

  /** Every move this toolbar makes keeps the reader where they were. */
  const go = (href: string) => router.push(href, { scroll: false });

  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-2">
        {searchable ? (
          <form
            className="flex items-end gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get(`${prefix}_q`);
              // A new search starts at its own first page; the size is kept,
              // or searching would silently snap back to ten rows.
              go(hrefFor({ q: String(value ?? "").trim(), page: 1 }));
            }}
          >
            <div>
              <label className="mb-1 block text-xs text-on-surface-variant" htmlFor={`${prefix}_q`}>
                {searchLabel}
              </label>
              {/* `key` on the search term: the component survives navigation, so
                  an uncontrolled field would keep the old text after "ניקוי"
                  emptied the URL. Re-mounting on the term is what keeps the box
                  and the address in step. */}
              <Input
                key={params.q}
                id={`${prefix}_q`}
                name={`${prefix}_q`}
                defaultValue={params.q}
                data-testid={`${prefix}-search`}
                className="h-9 w-48"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm" data-testid={`${prefix}-search-go`}>
              <Search className="size-4" />
              <span className="sr-only">חיפוש</span>
            </Button>
            {params.q ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid={`${prefix}-search-clear`}
                onClick={() => go(hrefFor({ q: "", page: 1 }))}
              >
                ניקוי
              </Button>
            ) : null}
          </form>
        ) : null}

        {exportHref ? (
          <Button variant="ghost" size="sm" asChild>
            {/* A plain anchor and NOT a router push: this is a download, and the
                URL carries the same search the table is showing. */}
            <a href={exportHref} data-testid={`${prefix}-export`}>
              <Download className="size-4" />
              ייצוא
            </a>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-on-surface-variant" data-testid={`${prefix}-range`}>
          {rangeLabel(params, total)}
        </span>

        <label className="sr-only" htmlFor={`${prefix}_size`}>
          שורות בעמוד
        </label>
        <select
          id={`${prefix}_size`}
          name={`${prefix}_size`}
          value={String(params.size)}
          data-testid={`${prefix}-size`}
          // Changing the size applies at once. A separate "apply" button was a
          // second click for a choice that has no other meaning.
          onChange={(e) => go(hrefFor({ size: Number(e.target.value), page: 1 }))}
          className="h-8 rounded-sm border border-outline-variant bg-surface-container px-2 text-start text-xs"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n} בעמוד
            </option>
          ))}
        </select>

        <span className="flex items-center gap-1">
          {/* RTL: ChevronRight points backwards on screen — the previous page. */}
          <PagerLink
            href={hrefFor({ page: params.page - 1 })}
            disabled={params.page <= 1}
            testId={`${prefix}-prev`}
            label="עמוד קודם"
          >
            <ChevronRight className="size-4" />
          </PagerLink>
          <span className="text-xs text-on-surface-variant" data-testid={`${prefix}-page`}>
            <Ltr>
              {params.page} / {last}
            </Ltr>
          </span>
          <PagerLink
            href={hrefFor({ page: params.page + 1 })}
            disabled={params.page >= last}
            testId={`${prefix}-next`}
            label="עמוד הבא"
          >
            <ChevronLeft className="size-4" />
          </PagerLink>
        </span>
      </div>
    </div>
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
    "inline-flex size-7 items-center justify-center rounded-sm border border-outline-variant";

  if (disabled) {
    return (
      <span
        className={cn(shape, "opacity-30")}
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
      className={cn(shape, "hover:bg-surface-container")}
      data-testid={testId}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
