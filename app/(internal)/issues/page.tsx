import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, FileDown, Newspaper, Plus } from "lucide-react";

import { canReadArea, canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listIssues } from "@/lib/data/issues";
import { ISSUE_STATUS_LABELS, type IssueStatus } from "@/lib/domain/issue-status";
import { OPEN_ISSUE_STATES } from "@/lib/domain/dashboard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { ISSUE_TONE } from "@/components/status-tone";

export const metadata: Metadata = { title: "גיליונות · Gilion" };

const dateFormat = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "issues");

  // `open` is what the dashboard's "גיליונות פתוחים" card counted (FR-20), and
  // the filter here applies exactly the states it counted — a card that opens a
  // list of everything has not answered the question it was clicked for.
  const { status: filter = "all" } = await searchParams;
  const all = await listIssues(ctx.businessId);
  const issues =
    filter === "open"
      ? all.filter((i) => (OPEN_ISSUE_STATES as string[]).includes(i.status))
      : filter === "closed"
        ? all.filter((i) => i.status === "closed")
        : all;
  const mayWrite = canWriteArea(ctx, "issues");
  // Sales reads the final PDF but never produces one (07-pdf.md §הרשאות).
  const mayDownloadPdf = canReadArea(ctx, "pdf");

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 flex items-center gap-2 font-serif text-3xl font-semibold">
            <Newspaper className="size-7" />
            גיליונות ושיבוץ
          </h1>
          <p className="text-sm text-on-surface-variant">
            כל גיליון מצלם את חלוקת העמוד של העיתון בזמן הפתיחה, כך ששינוי מאוחר בהגדרות לא מזיז שום
            מודעה שכבר שובצה.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" data-testid="issue-report-link">
            <Link href="/issues/report">
              <ClipboardList className="size-4" />
              מעקב גיליונות
            </Link>
          </Button>
          {mayWrite ? (
            <Button asChild data-testid="new-issue">
              <Link href="/issues/new">
                <Plus className="size-4" />
                פתיחת גיליון חדש
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2" data-testid="issue-status-filters">
        {(
          [
            { value: "all", label: "הכל", count: all.length },
            {
              value: "open",
              label: "פתוחים",
              count: all.filter((i) => (OPEN_ISSUE_STATES as string[]).includes(i.status)).length,
            },
            {
              value: "closed",
              label: "סגורים",
              count: all.filter((i) => i.status === "closed").length,
            },
          ] as const
        ).map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "all" ? "/issues" : `/issues?status=${tab.value}`}
            data-testid={`issue-filter-${tab.value}`}
            aria-current={filter === tab.value ? "page" : undefined}
            className={
              filter === tab.value
                ? "inline-flex h-8 items-center gap-2 rounded-full bg-primary px-3 text-sm font-medium text-on-primary"
                : "inline-flex h-8 items-center gap-2 rounded-full bg-surface-container-lowest px-3 text-sm font-medium text-on-surface-variant ring-1 ring-outline-variant hover:bg-surface-container"
            }
          >
            {tab.label}
            {/* `count !== undefined`, never `count &&` — zero is an answer. */}
            <span className="ltr-isolate text-xs opacity-70">{tab.count}</span>
          </Link>
        ))}
      </div>

      {issues.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "אין עדיין גיליונות" : "אין גיליונות בסינון הזה"}
          body={
            all.length === 0
              ? "גיליון נפתח לתאריך של עיתון, ומרגע שנפתח אפשר לשבץ עליו את הפרסומים שכבר מתוכננים לאותו יום."
              : 'יש גיליונות, אבל אף אחד מהם אינו בסינון הנוכחי. אפשר לבחור "הכל" למעלה.'
          }
          action={
            mayWrite && all.length === 0 ? (
              <Button asChild>
                <Link href="/issues/new">פתיחת גיליון חדש</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {issues.map((issue) => {
            const status = issue.status as IssueStatus;
            const progress =
              issue.plannedCount > 0
                ? Math.round((issue.placedCount / issue.plannedCount) * 100)
                : 0;

            return (
              <li
                key={issue.id}
                data-testid={`issue-card-${issue.id}`}
                className="flex flex-col gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="font-serif text-lg font-semibold">{issue.newspaper.name}</h2>
                    <p className="text-sm text-on-surface-variant">
                      <Ltr>{dateFormat.format(issue.issue_date)}</Ltr>
                    </p>
                  </div>
                  <Badge tone={ISSUE_TONE[status]} data-testid="issue-status">
                    {ISSUE_STATUS_LABELS[status]}
                  </Badge>
                </div>

                <div>
                  <p className="mb-1 text-sm" data-testid="issue-progress">
                    שובצו <Ltr>{issue.placedCount}</Ltr> מתוך <Ltr>{issue.plannedCount}</Ltr>
                  </p>
                  <div
                    className="h-1.5 overflow-hidden rounded-full bg-surface-container"
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="התקדמות שיבוץ"
                  >
                    <div className="h-full bg-primary" style={{ inlineSize: `${progress}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    <Ltr>{issue._count.pages}</Ltr> עמודים
                  </p>
                </div>

                <div className="mt-auto flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/issues/${issue.id}/board`}>פתח לוח שיבוץ</Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost" data-testid="issue-check-link">
                    <Link href={`/issues/${issue.id}/validate`}>
                      {status === "closed" ? "בדיקה ו־PDF" : "בדיקה וסגירה"}
                    </Link>
                  </Button>
                  {status === "closed" && issue.final_pdf_url && mayDownloadPdf ? (
                    <Button asChild size="sm" variant="ghost" data-testid="download-final-pdf">
                      <a href={`/api/issues/${issue.id}/pdf?type=final`}>
                        <FileDown className="size-4" />
                        הורד PDF סופי
                      </a>
                    </Button>
                  ) : null}
                  {status === "closed" && issue.press_pdf_url && mayDownloadPdf ? (
                    <Button asChild size="sm" variant="ghost" data-testid="download-press-pdf">
                      <a href={`/api/issues/${issue.id}/pdf?type=press`}>
                        <FileDown className="size-4" />
                        הורד PDF לדפוס
                      </a>
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
