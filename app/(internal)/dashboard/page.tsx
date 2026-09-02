import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, LayoutGrid, Plus } from "lucide-react";

import { canReadArea, canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { openIssuesForPlacement } from "@/lib/data/issues";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";

export const metadata: Metadata = { title: "לוח בקרה · Gilion" };

const DATE = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * The first screen after signing in — and until stage 10, a dead end.
 *
 * It said "nothing here yet, the operational dashboard is built in stage 10"
 * and stopped, which is honest and useless: the only route to the work was
 * noticing one item in the menu. Somebody who wanted to lay out an issue had
 * to already know that an issue is a thing you open first, and where.
 *
 * So the empty state is replaced by the shortest true answer to "what now" —
 * the issues that are open for placing, and the way to open another. The KPI
 * dashboard stage 10 delivers replaces this; what it must not do is take the
 * answer away again.
 */
export default async function DashboardPage() {
  // Every server entry point starts here — conventions.md §9, no exceptions.
  const ctx = await getTenantContext();
  requireArea(ctx, "dashboard");

  const mayReadIssues = canReadArea(ctx, "issues");
  const mayWriteIssues = canWriteArea(ctx, "issues");
  const issues = mayReadIssues ? await openIssuesForPlacement(ctx.businessId) : [];

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">לוח בקרה</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        נכנסת כ־{ROLE_LABELS[ctx.role]}. התפריט מציג רק את האזורים שהתפקיד שלך מורשה לראות.
      </p>

      {mayReadIssues ? (
        <section
          aria-label="גיליונות פתוחים לשיבוץ"
          data-testid="open-issues"
          className="mb-6 rounded-lg border border-outline-variant bg-surface-container-lowest p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
              <LayoutGrid className="size-5" />
              פתוח לשיבוץ
            </h2>
            {mayWriteIssues ? (
              <Button asChild size="sm" data-testid="dashboard-new-issue">
                <Link href="/issues/new">
                  <Plus className="size-4" />
                  פתיחת גיליון חדש
                </Link>
              </Button>
            ) : null}
          </div>

          {issues.length === 0 ? (
            <p className="text-sm text-on-surface-variant" data-testid="no-open-issues">
              אין כרגע גיליון פתוח לשיבוץ.{" "}
              {mayWriteIssues
                ? "שיבוץ מתחיל בפתיחת גיליון לתאריך של עיתון — הכפתור למעלה."
                : "גיליון נפתח לתאריך של עיתון."}
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {issues.map((issue) => (
                <li key={issue.id}>
                  <Link
                    href={`/issues/${issue.id}/board`}
                    data-testid={`open-issue-${issue.id}`}
                    className="flex items-center justify-between gap-3 rounded-md border border-outline-variant p-3 transition-colors hover:bg-surface-container"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{issue.newspaperName}</span>
                      <span className="block text-sm text-on-surface-variant">
                        <CalendarDays className="me-1 inline size-3.5" />
                        <Ltr>{DATE.format(issue.date)}</Ltr>
                        {" · "}
                        שובצו <Ltr>{issue.placedCount}</Ltr> מתוך <Ltr>{issue.plannedCount}</Ltr>
                      </span>
                    </span>
                    {/* RTL: the arrow pointing left is the one that means
                        "onwards" on screen. */}
                    <ArrowLeft className="size-4 shrink-0 text-on-surface-variant" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <p className="text-sm text-on-surface-variant">
        הדשבורד התפעולי — מי מפרסם השבוע, למי חסרה מודעה, מי לא שובץ ומי חייב כסף — נבנה בשלב 10.
      </p>
    </>
  );
}
