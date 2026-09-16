import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";
import { PAGE_SIZES, pageCount, rangeLabel, type ListParams } from "@/lib/domain/list-view";
import { cn } from "@/lib/utils";

/**
 * Search, page size, paging and export, for one list among several on a page.
 *
 * A server component on purpose. Every control is a link or a GET form, so the
 * state it changes is the URL — which is what lets a reload, a shared link and
 * the CSV export all agree about which rows are being looked at. A client
 * component holding this in `useState` would put the export and the screen out
 * of step the moment somebody typed a search.
 *
 * `prefix` namespaces the parameters, because the customer card carries five of
 * these at once and each has to page without disturbing the other four.
 */
export function ListToolbar({
  prefix,
  params,
  total,
  hrefFor,
  searchLabel,
  exportHref,
  searchable = true,
}: {
  /** e.g. "o" → o_page, o_size, o_q. */
  prefix: string;
  params: ListParams;
  total: number;
  /** Builds a URL for this section with some of its parameters changed. */
  hrefFor: (next: Partial<Record<"page" | "size" | "q", string>>) => string;
  searchLabel: string;
  /** Omitted when the viewer may not export this list (FR-8). */
  exportHref?: string | undefined;
  searchable?: boolean;
}) {
  const last = pageCount(total, params.size);

  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-end gap-2">
        {searchable ? (
          // A GET form and not an input with an onChange: no JavaScript, no
          // debounce, and the URL it produces is the one the export reads.
          <form className="flex items-end gap-1">
            <div>
              <label className="mb-1 block text-xs text-on-surface-variant" htmlFor={`${prefix}_q`}>
                {searchLabel}
              </label>
              <Input
                id={`${prefix}_q`}
                name={`${prefix}_q`}
                defaultValue={params.q}
                data-testid={`${prefix}-search`}
                className="h-9 w-48"
              />
            </div>
            {/* Size rides along so searching does not silently reset it back to
                ten rows; the page does NOT, because a new search starts at its
                own first page. */}
            <input type="hidden" name={`${prefix}_size`} value={String(params.size)} />
            <Button type="submit" variant="secondary" size="sm" data-testid={`${prefix}-search-go`}>
              <Search className="size-4" />
              <span className="sr-only">חיפוש</span>
            </Button>
            {params.q ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href={hrefFor({ q: "", page: "1" })} data-testid={`${prefix}-search-clear`}>
                  ניקוי
                </Link>
              </Button>
            ) : null}
          </form>
        ) : null}

        {exportHref ? (
          <Button variant="ghost" size="sm" asChild>
            {/* A plain link, not a fetch: the browser downloads it, and the URL
                carries the same search the table is showing. */}
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

        <form className="flex items-center gap-1">
          {params.q ? <input type="hidden" name={`${prefix}_q`} value={params.q} /> : null}
          <label className="sr-only" htmlFor={`${prefix}_size`}>
            שורות בעמוד
          </label>
          <select
            id={`${prefix}_size`}
            name={`${prefix}_size`}
            defaultValue={String(params.size)}
            data-testid={`${prefix}-size`}
            className="h-8 rounded-sm border border-outline-variant bg-surface-container px-2 text-start text-xs"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n} בעמוד
              </option>
            ))}
          </select>
          <Button type="submit" variant="ghost" size="sm" data-testid={`${prefix}-size-go`}>
            החלה
          </Button>
        </form>

        <span className="flex items-center gap-1">
          {/* RTL: ChevronRight points backwards on screen — the previous page. */}
          <PagerLink
            href={hrefFor({ page: String(params.page - 1) })}
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
            href={hrefFor({ page: String(params.page + 1) })}
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
 * One arrow. Disabled is a `<span>` and not a dead `<a>`: a link that goes
 * nowhere still looks clickable and still takes focus.
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
      className={cn(shape, "hover:bg-surface-container")}
      data-testid={testId}
      aria-label={label}
    >
      {children}
    </Link>
  );
}
