import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Newspaper, Plus } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listIssues } from "@/lib/data/issues";
import { ISSUE_STATUS_LABELS, type IssueStatus } from "@/lib/domain/issue-status";
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

export default async function IssuesPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "issues");

  const issues = await listIssues(ctx.businessId);
  const mayWrite = canWriteArea(ctx, "issues");

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

      {issues.length === 0 ? (
        <EmptyState
          title="אין עדיין גיליונות"
          body="גיליון נפתח לתאריך של עיתון, ומרגע שנפתח אפשר לשבץ עליו את הפרסומים שכבר מתוכננים לאותו יום."
          action={
            mayWrite ? (
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

                <div className="mt-auto flex gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/issues/${issue.id}/board`}>פתח לוח שיבוץ</Link>
                  </Button>
                  {status === "closed" ? (
                    // Stage 07 writes the file; until then the button says so
                    // rather than pretending to be a download that does nothing.
                    <Button size="sm" variant="ghost" disabled title="יופעל בשלב הפקת ה־PDF">
                      הורד PDF סופי
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
