import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { issueReport } from "@/lib/data/issues";
import { ISSUE_STATUS_LABELS, type IssueStatus } from "@/lib/domain/issue-status";
import { pageLabel } from "@/lib/domain/issue-layout";
import { sizeLabel } from "@/lib/domain/placement";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { ISSUE_TONE } from "@/components/status-tone";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "מעקב גיליונות · Gilion" };

const DATE = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const STAMP = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});

const FILTERS = [
  ["all", "הכל"],
  ["open", "עדיין פתוחים"],
  ["closed", "סגורים"],
] as const;

/**
 * Every issue, closed or not, and what went into it (backlog item 11).
 *
 * ── One screen, because the question is one question ─────────────────────────
 * "Which issues are done, and what is in them" was answerable only by opening
 * each board in turn and reading its pages — which is the kind of check people
 * stop doing, and then an issue goes to print with a page nobody looked at.
 *
 * ── Who uploaded, not who placed ─────────────────────────────────────────────
 * `Placement` carries no user, so "who placed this" is not a question the data
 * can answer — it was asked for once, then withdrawn. The column names what it
 * really is: who uploaded the ARTWORK. Keeping the heading honest is what lets
 * every other column here be trusted.
 */
export default async function IssueReportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "issues");

  const { status: raw } = await searchParams;
  const status = FILTERS.some(([value]) => value === raw)
    ? (raw as (typeof FILTERS)[number][0])
    : "all";

  const issues = await issueReport(ctx.businessId, { status });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 flex items-center gap-2 page-title font-serif text-headline-lg font-semibold">
            <ClipboardList className="size-7" />
            מעקב גיליונות
          </h1>
          <p className="text-sm text-on-surface-variant">
            כל גיליון, סגור או פתוח, ומה שובץ בו — לקוח, צורה, גודל ועמוד.
          </p>
        </div>
        <Button asChild size="sm" variant="ghost">
          <Link href="/issues">חזרה לגיליונות</Link>
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" data-testid="report-filters">
        {FILTERS.map(([value, label]) => (
          <Link
            key={value}
            href={value === "all" ? "/issues/report" : `/issues/report?status=${value}`}
            data-testid={`report-filter-${value}`}
            aria-current={status === value ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              status === value
                ? "border-primary bg-status-accent-bg font-medium"
                : "border-outline-variant hover:bg-surface-container",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {issues.length === 0 ? (
        <EmptyState
          title="אין גיליונות להצגה"
          body="גיליון נפתח לתאריך של עיתון. ברגע שיהיה אחד, כל מה ששובץ בו יופיע כאן."
        />
      ) : (
        <div className="space-y-4">
          {issues.map((issue) => (
            <section
              key={issue.id}
              data-testid={`report-issue-${issue.id}`}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex flex-wrap items-center gap-2 font-serif text-lg font-semibold">
                  {issue.newspaperName}
                  <span className="text-on-surface-variant">
                    <Ltr>{DATE.format(issue.date)}</Ltr>
                  </span>
                  <Badge tone={ISSUE_TONE[issue.status]} data-testid={`report-status-${issue.id}`}>
                    {ISSUE_STATUS_LABELS[issue.status]}
                  </Badge>
                  {issue.closedAt ? (
                    <span className="text-xs font-normal text-on-surface-variant">
                      נסגר <Ltr>{STAMP.format(issue.closedAt)}</Ltr>
                    </span>
                  ) : null}
                </h2>
                <span className="text-sm text-on-surface-variant">
                  <Ltr>{issue.pageCount}</Ltr> עמודים · <Ltr>{issue.placements.length}</Ltr> שיבוצים
                </span>
              </div>

              {issue.placements.length === 0 ? (
                <p className="text-sm text-on-surface-variant">
                  עוד לא שובץ שום פרסום בגיליון הזה.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid={`report-table-${issue.id}`}>
                    <thead className="bg-surface-container">
                      <tr>
                        <th className="p-2 text-start font-semibold">לקוח</th>
                        <th className="p-2 text-start font-semibold">עמוד</th>
                        <th className="p-2 text-start font-semibold">צורה</th>
                        <th className="p-2 text-start font-semibold">גודל</th>
                        <th className="p-2 text-start font-semibold">מודעה</th>
                        {/* Named for what it is. There is no record of who
                            placed it — see the note at the top of this file. */}
                        <th className="p-2 text-start font-semibold" data-testid="col-uploaded-by">
                          מי העלה את המודעה
                        </th>
                        <th className="p-2 text-start font-semibold">שובץ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {issue.placements.map((placement) => (
                        <tr
                          key={placement.id}
                          data-testid={`report-row-${placement.id}`}
                          className="border-t border-outline-variant"
                        >
                          <td className="p-2">
                            <Link
                              href={`/customers/${placement.customerId}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {placement.customerName}
                            </Link>
                          </td>
                          <td className="p-2">
                            {pageLabel(placement.pageNumber, issue.pageCount)}
                          </td>
                          <td className="p-2">
                            {placement.shapeName}
                            {placement.duplicate ? (
                              <Badge tone="accent" className="ms-2">
                                חריגה מאושרת
                              </Badge>
                            ) : null}
                          </td>
                          <td className="p-2">
                            {/* Centimetres, measured against THIS issue's own
                                snapshot grid — the newspaper may have been
                                re-columned since (conventions.md §7). */}
                            {issue.grid ? sizeLabel(placement, issue.grid) : "—"}
                          </td>
                          <td className="p-2 text-on-surface-variant">{placement.adName}</td>
                          <td className="p-2 text-on-surface-variant">{placement.uploadedBy}</td>
                          <td className="p-2 text-on-surface-variant">
                            <Ltr>{STAMP.format(placement.placedAt)}</Ltr>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
