import type { Metadata } from "next";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listNewspapers } from "@/lib/data/newspapers";
import { occupancyOverview, type OccupancyRow } from "@/lib/data/page-load";
import { addDays, jerusalemDay } from "@/lib/domain/calendar";
import { baseHrefFor, parseListParams } from "@/lib/domain/list-view";
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "תפוסת עמודים · Gilion" };

const DATE = new Intl.DateTimeFormat("he-IL", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/** How far ahead the overview looks — about a quarter. */
const HORIZON_DAYS = 90;

/**
 * Which pages of each newspaper are already sold, per date (the user,
 * 12/10/2026). Counted from the ORDERS — approved, waiting for approval and
 * drafts — so a date shows what is sold on it before anyone opened its issue.
 */
export default async function OccupancyPage({
  searchParams,
}: {
  searchParams: Promise<{ paper?: string; page?: string; size?: string; q?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "issues");

  const raw = await searchParams;
  const papers = await listNewspapers(ctx.businessId);
  const paper = papers.find((p) => p.id === raw.paper) ?? papers[0];
  const list = parseListParams(raw);

  const today = jerusalemDay(new Date());
  const all = paper
    ? await occupancyOverview(ctx.businessId, paper.id, today, addDays(today, HORIZON_DAYS))
    : [];
  const shown = all.slice((list.page - 1) * list.size, list.page * list.size);
  const base = baseHrefFor("/issues/occupancy", raw);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 flex items-center gap-2 page-title font-serif text-headline-lg font-semibold">
            <LayoutGrid className="size-7" />
            תפוסת עמודים
          </h1>
          <p className="text-sm text-on-surface-variant">
            כמה נמכר מכל סוג עמוד בכל תאריך — לפי ההזמנות: מאושרות, ממתינות לאישור וטיוטות.
          </p>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link href="/issues">חזרה לגיליונות</Link>
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" data-testid="occupancy-papers">
        {papers.map((p) => (
          <Link
            key={p.id}
            href={`/issues/occupancy?paper=${p.id}`}
            aria-current={paper?.id === p.id ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              paper?.id === p.id
                ? "border-primary bg-status-accent-bg font-medium"
                : "border-outline-variant hover:bg-surface-container",
            )}
          >
            {p.name}
          </Link>
        ))}
      </div>

      <ListToolbar prefix="" params={list} total={all.length} baseHref={base} searchable={false} />

      {shown.length === 0 ? (
        <EmptyState
          title="אין תאריכים להצגה"
          body="ברגע שיימכר פרסום, או שלעיתון יוגדרו ימי הוצאה, התאריכים יופיעו כאן."
        />
      ) : (
        <div className="space-y-4">
          {shown.map((d) => (
            <section
              key={d.date}
              data-testid={`occupancy-${d.date}`}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-elevation-1"
            >
              <h2 className="mb-3 flex flex-wrap items-center gap-2 font-serif text-lg font-semibold">
                <Ltr>{DATE.format(new Date(d.date))}</Ltr>
                {d.hasIssue ? (
                  <Badge tone="accent">גיליון פתוח</Badge>
                ) : (
                  <Badge>אין עדיין גיליון</Badge>
                )}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-container">
                    <tr>
                      <th className="p-2 text-start font-semibold">סוג עמוד</th>
                      <th className="p-2 text-start font-semibold">עמודים</th>
                      <th className="p-2 text-start font-semibold">מאושר</th>
                      <th className="p-2 text-start font-semibold">ממתין לאישור</th>
                      <th className="p-2 text-start font-semibold">טיוטה</th>
                      <th className="p-2 text-start font-semibold">עמודים מלאים</th>
                      <th className="p-2 text-start font-semibold whitespace-nowrap">מצב</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.pageTypeId} className="border-t border-outline-variant">
                        <td className="p-2 font-medium">{r.pageTypeName}</td>
                        <td className="p-2">
                          <Ltr>{r.pages}</Ltr>
                        </td>
                        <td className="p-2">{pagesOf(r.used.approved, r.perPage)}</td>
                        <td className="p-2">{pagesOf(r.used.pending, r.perPage)}</td>
                        <td className="p-2 text-on-surface-variant">
                          {pagesOf(r.used.draft, r.perPage)}
                        </td>
                        <td className="p-2">
                          <Ltr>{r.fullPages}</Ltr>
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <State row={r} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {all.length > 0 ? (
        <ListPager prefix="" params={list} total={all.length} baseHref={base} />
      ) : null}
    </>
  );
}

/** Sold area in pages, one decimal — "1.5 עמודים" reads; cells do not. */
function pagesOf(cells: number, perPage: number) {
  if (cells === 0 || perPage === 0) return "—";
  return <Ltr>{(cells / perPage).toFixed(1)}</Ltr>;
}

function State({ row }: { row: OccupancyRow }) {
  const committed = row.used.approved + row.used.pending;
  if (row.limited) {
    if (row.overflow > 0) return <Badge tone="error">נמכר יותר ממה שנכנס</Badge>;
    const free = row.pages * row.perPage - committed;
    if (free <= 0) return <Badge tone="warning">מלא</Badge>;
    const pct = Math.round((free / Math.max(1, row.pages * row.perPage)) * 100);
    return <Badge tone="success">{pct}% פנוי</Badge>;
  }
  // Inner pages grow with the issue — the number to know is how many it needs.
  if (row.pagesNeeded > row.pages) {
    return <Badge tone="warning">נדרשים {row.pagesNeeded} עמודים</Badge>;
  }
  return <Badge tone="success">יש מקום</Badge>;
}
