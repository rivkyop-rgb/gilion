import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck } from "lucide-react";

import { canReadArea, canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { checkIssue } from "@/lib/data/issue-validation";
import { pdfLogFor } from "@/lib/data/issue-pdf";
import { ISSUE_STATUS_LABELS, type IssueStatus } from "@/lib/domain/issue-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { ISSUE_TONE } from "@/components/status-tone";
import { IssueCheckPanel } from "@/components/issues/issue-check-panel";

export const metadata: Metadata = { title: "בדיקה וסגירת גיליון · Gilion" };

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

/**
 * The check-and-close screen (US-008, FR-12).
 *
 * ── Why this is not a dialog on the board ────────────────────────────────────
 * Closing an issue is the one irreversible thing a designer does, and the seven
 * findings are a WORK LIST — you read them, you go and fix things, you come
 * back. A dialog over the board would have made "go and fix things" mean
 * dismissing the list first, which is how a list stops being read.
 *
 * The findings are computed on the server, on every load. There is no cached
 * report and no "last checked at": a stale verdict about whether an issue may
 * go to press is worse than no verdict.
 */
export default async function ValidateIssuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getTenantContext();
  requireArea(ctx, "issues");

  const check = await checkIssue(ctx.businessId, id);
  if (!check) notFound();

  const log = await pdfLogFor(ctx.businessId, id);
  const status = check.status as IssueStatus;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="mb-1 flex items-center gap-2 page-title font-serif text-headline-lg font-semibold">
            <ClipboardCheck className="size-7" />
            בדיקה וסגירה
          </h1>
          <p className="text-sm text-on-surface-variant">
            {check.newspaperName} · <Ltr>{DATE.format(check.issueDate)}</Ltr>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={ISSUE_TONE[status]} data-testid="check-issue-status">
            {ISSUE_STATUS_LABELS[status]}
          </Badge>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/issues/${id}/board`}>חזרה ללוח השיבוץ</Link>
          </Button>
        </div>
      </div>

      <IssueCheckPanel
        issueId={id}
        status={status}
        report={check.report}
        mayClose={canWriteArea(ctx, "pdf")}
        mayDownload={canReadArea(ctx, "pdf")}
        isAdmin={ctx.role === "admin" || ctx.isSuperAdmin}
        log={log.map((row) => ({
          id: row.id,
          type: row.pdf_type,
          status: row.status,
          who: row.generated_by.name,
          when: STAMP.format(row.generated_at),
          error: row.error_message,
        }))}
      />
    </>
  );
}
