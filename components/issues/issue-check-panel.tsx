"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Layers,
  Lock,
  RotateCcw,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { cn } from "@/lib/utils";
import {
  FINDING_CLEAR,
  FINDING_KINDS,
  FINDING_TITLES,
  blockingSummary,
  isCloseable,
  type Finding,
  type ValidationReport,
} from "@/lib/domain/issue-validation";
import type { IssueStatus } from "@/lib/domain/issue-status";
import { closeIssueAction, reopenIssueAction } from "@/app/(internal)/issues/actions";
import { NextIssueOffer } from "./issue-calendar";

export type PdfLogRow = {
  id: string;
  type: string;
  status: string;
  who: string;
  when: string;
  error: string | null;
};

/**
 * The findings, and the two buttons at the bottom of them (US-008).
 *
 * ── Every item links back to its slot ────────────────────────────────────────
 * A finding that only NAMES a problem makes the reader go and find it, and on a
 * twenty-page issue that is the whole cost of fixing it. So each row carries
 * the page it lives on and links to the board already open at that view — the
 * board reads `?page=` and jumps.
 *
 * The one finding with no page is an unplaced publication: it is nowhere yet,
 * which is the problem. Those link to the board's unplaced panel instead.
 */
export function IssueCheckPanel({
  issueId,
  status,
  report,
  mayClose,
  mayDownload,
  isAdmin,
  log,
}: {
  issueId: string;
  status: IssueStatus;
  report: ValidationReport;
  mayClose: boolean;
  mayDownload: boolean;
  isAdmin: boolean;
  log: PdfLogRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  /**
   * The moment an issue closes is the moment the next one starts mattering,
   * and the moment somebody has the printing schedule in their head. It used to
   * be offered from the board's status button; the close moved here, and the
   * offer came with it — asking later means asking nobody (backlog items 6-8).
   */
  const [offerNext, setOfferNext] = useState(false);

  const closed = status === "closed";
  const closeable = isCloseable(report);
  const found = new Map(report.findings.map((f) => [f.kind, f]));

  return (
    <div className="pb-24">
      {/* KPI strip — four numbers, and the fourth is the one that decides. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="פרסומים לתאריך" value={report.plannedCount} testId="kpi-planned" />
        <Kpi label="שובצו" value={report.placedCount} testId="kpi-placed" />
        <Kpi
          label="לא שובצו"
          value={report.plannedCount - report.placedCount}
          testId="kpi-unplaced"
          tone={report.plannedCount - report.placedCount > 0 ? "error" : "success"}
        />
        <Kpi
          label="ממצאים חוסמים"
          value={report.blockingCount}
          testId="kpi-blocking"
          tone={report.blockingCount > 0 ? "error" : "success"}
        />
      </div>

      {notice ? (
        <p
          data-testid="check-message"
          className={cn(
            "mb-4 rounded-lg p-3 text-sm",
            notice.ok
              ? "bg-status-success-bg text-status-success-fg"
              : "bg-status-error-bg text-status-error-fg",
          )}
        >
          {notice.text}
        </p>
      ) : null}

      {closed ? <ClosedCard issueId={issueId} mayDownload={mayDownload} log={log} /> : null}

      {/* Every group, in the fixed order of the seven checks — including the
          clean ones. A screen that hides what passed makes a person wonder
          whether it was checked at all. */}
      <ul className="grid gap-3">
        {FINDING_KINDS.map((kind) => {
          const finding = found.get(kind);
          return finding ? (
            <FindingCard key={kind} issueId={issueId} finding={finding} />
          ) : (
            <li
              key={kind}
              data-testid={`finding-${kind}`}
              data-severity="clear"
              className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3 text-sm"
            >
              <CheckCircle2 className="size-4 shrink-0 text-status-success-fg" />
              <span className="text-on-surface-variant">{FINDING_TITLES[kind]}</span>
              <span className="ms-auto text-xs text-status-success-fg">{FINDING_CLEAR[kind]}</span>
            </li>
          );
        })}
      </ul>

      {/* Sticky footer: the draft is always available, the close is not. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant bg-surface-container-lowest/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
          {report.blockingCount > 0 ? (
            <p className="me-auto text-xs text-status-error-fg" data-testid="blocking-summary">
              {blockingSummary(report)}
            </p>
          ) : null}

          {mayClose ? (
            <Button asChild variant="secondary" data-testid="draft-pdf">
              {/* A plain link and not fetch(): the browser has to be the one to
                  save the file, and a response body handed to JavaScript is not
                  a download. `download` is deliberately absent — the header on
                  the response names the file, in Hebrew, via RFC 5987 — and so
                  is target="_blank": the response is an attachment, so the tab
                  never navigates, and a popup would only be an empty window to
                  close afterwards. */}
              <a href={`/api/issues/${issueId}/pdf?type=draft`}>
                <FileText className="size-4" />
                הפק PDF טיוטה
              </a>
            </Button>
          ) : null}

          {mayClose && !closed ? (
            /* The imposed sheets — what a press folds, not what a person reads.
               
               Offered on an OPEN issue on purpose: confirming a fold with a
               print shop is something you do before committing to it. Once the
               issue IS closed this disappears and the stored file takes over,
               because at that point re-rendering answers the wrong question —
               "what would this look like" instead of "what did we send".
               
               The tooltip names the one thing that has to be checked against
               them, because a mirrored imposition is a whole run in the bin. */
            <Button asChild variant="secondary" data-testid="press-pdf">
              <a href={`/api/issues/${issueId}/pdf?type=press`}>
                <Layers className="size-4" />
                הפק PDF לדפוס
              </a>
            </Button>
          ) : null}

          {mayClose && !closed ? <PressNote /> : null}

          {mayClose && !closed ? (
            <CloseIssueDialog
              issueId={issueId}
              disabled={!closeable}
              blocking={blockingSummary(report)}
              placedCount={report.placedCount}
              onDone={(message, ok) => {
                setNotice({ text: message, ok });
                if (ok) setOfferNext(true);
                router.refresh();
              }}
            />
          ) : null}

          {closed && isAdmin ? (
            <Button
              variant="secondary"
              disabled={pending}
              data-testid="reopen-issue"
              onClick={() =>
                startTransition(async () => {
                  const result = await reopenIssueAction(issueId);
                  setNotice({
                    text: result.message ?? "הגיליון נפתח מחדש",
                    ok: result.ok === true,
                  });
                  router.refresh();
                })
              }
            >
              <RotateCcw className="size-4" />
              פתח מחדש
            </Button>
          ) : null}
        </div>
      </div>

      {offerNext ? <NextIssueOffer issueId={issueId} onClose={() => setOfferNext(false)} /> : null}
    </div>
  );
}

/**
 * What the press file IS, said out loud next to the button that produces it.
 *
 * This text used to be a `title` tooltip. A tooltip is invisible until someone
 * hovers the exact element while already wondering — which is to say it is
 * invisible to the person who is NOT wondering, and that is the person who
 * reports the file as broken. Reported 08/09/2026 as "the sides come out
 * reversed": they do not, but an outer sheet reads 1 … 4 from left to right,
 * and to a Hebrew reader that looks wrong every time.
 *
 * The sheet itself carries the same sentence in its fold slug — this is the
 * half that reaches her before she opens the file.
 */
function PressNote() {
  return (
    <p className="basis-full text-xs text-on-surface-variant" data-testid="press-note">
      הקובץ לדפוס בנוי לפי סדר קיפול ולא לפי סדר קריאה: כל דף ברוחב כפול ונושא שני עמודים רחוקים זה
      מזה — השער והגב יושבים על אותו נייר. בצד החיצוני השער בחצי השמאלי. כל דף מסומן בקו הקיפול
      בעמודים שעליו.
    </p>
  );
}

function Kpi({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: number;
  testId: string;
  tone?: "error" | "success";
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p
        data-testid={testId}
        className={cn(
          "font-serif text-2xl font-semibold",
          tone === "error" && "text-status-error-fg",
          tone === "success" && "text-status-success-fg",
        )}
      >
        <Ltr>{value}</Ltr>
      </p>
    </div>
  );
}

function FindingCard({ issueId, finding }: { issueId: string; finding: Finding }) {
  const blocking = finding.severity === "blocking";

  return (
    <li
      data-testid={`finding-${finding.kind}`}
      data-severity={finding.severity}
      className={cn(
        "rounded-lg border p-3",
        blocking
          ? "border-status-error-fg/40 bg-status-error-bg/30"
          : "border-status-warning-fg/40 bg-status-warning-bg/30",
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        {blocking ? (
          <XCircle className="size-4 shrink-0 text-status-error-fg" />
        ) : (
          <AlertTriangle className="size-4 shrink-0 text-status-warning-fg" />
        )}
        <h2 className="font-medium">{finding.title}</h2>
        <Badge tone={blocking ? "error" : "warning"}>
          <Ltr>{finding.items.length}</Ltr>
        </Badge>
        <span className="ms-auto text-xs text-on-surface-variant">
          {blocking ? "חוסם סגירה" : "אזהרה בלבד"}
        </span>
      </div>

      <ul className="grid gap-1 text-sm">
        {finding.items.map((item, index) => (
          <li key={`${finding.kind}-${index}`} data-testid={`finding-item-${finding.kind}`}>
            <Link
              href={
                item.pageNumber === null
                  ? `/issues/${issueId}/board`
                  : `/issues/${issueId}/board?page=${item.pageNumber}`
              }
              className="flex flex-wrap items-center gap-2 rounded-sm px-2 py-1 underline-offset-2 hover:bg-surface-container-lowest hover:underline"
            >
              <span>{item.label}</span>
              {item.pageNumber === null ? (
                <span className="text-xs text-on-surface-variant">לא על העמוד</span>
              ) : (
                <span className="text-xs text-on-surface-variant">
                  עמוד <Ltr>{item.pageNumber}</Ltr>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
}

/** The PDF an issue keeps, and every attempt that produced one (FR-22). */
function ClosedCard({
  issueId,
  mayDownload,
  log,
}: {
  issueId: string;
  mayDownload: boolean;
  log: PdfLogRow[];
}) {
  const latest = log.find((row) => row.type === "final" && row.status === "generated");

  return (
    <div
      data-testid="final-pdf-card"
      className="mb-4 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Lock className="size-5 text-status-done-fg" />
        <div>
          <p className="font-medium">הגיליון סגור ונשמר PDF סופי</p>
          {latest ? (
            <p className="text-xs text-on-surface-variant">
              הופק ע״י {latest.who} · <Ltr>{latest.when}</Ltr>
            </p>
          ) : null}
        </div>
        {mayDownload ? (
          <div className="ms-auto flex flex-wrap gap-2">
            <Button asChild size="sm" data-testid="download-final-pdf">
              <a href={`/api/issues/${issueId}/pdf?type=final`}>
                <Download className="size-4" />
                הורד PDF סופי
              </a>
            </Button>
            {/* The file that actually went to the press. Served from the object
                store rather than re-rendered, so it is what was sent and not
                what would be sent now. */}
            <Button asChild size="sm" variant="secondary" data-testid="download-press-pdf">
              <a href={`/api/issues/${issueId}/pdf?type=press`}>
                <Layers className="size-4" />
                הורד PDF לדפוס
              </a>
            </Button>
            <PressNote />
          </div>
        ) : null}
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-on-surface-variant">
          לוג הפקות (<Ltr>{log.length}</Ltr>)
        </summary>
        <ul className="mt-2 grid gap-1 text-xs" data-testid="pdf-log">
          {log.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2">
              {/* Three types, not two. A `press` row fell through to "טיוטה"
                  here, so the log said a draft had been produced at the exact
                  moment the press file was — the one record that answers
                  "what did we actually send". */}
              <Badge tone={row.status === "generated" ? "success" : "error"}>
                {row.type === "final" ? "סופי" : row.type === "press" ? "לדפוס" : "טיוטה"}
              </Badge>
              <span>{row.who}</span>
              <Ltr>{row.when}</Ltr>
              {row.error ? <span className="text-status-error-fg">{row.error}</span> : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/**
 * The confirmation, and the wait after it.
 *
 * ── Why the stages are named but not ticked off ──────────────────────────────
 * The close is one round trip: render, upload, commit. The server does not
 * report back between them, so a bar that filled a third at a time would be
 * animating a guess. What a person actually needs while waiting is to know the
 * machine is doing something specific and roughly how long it takes — so the
 * three stages are NAMED and the bar is honestly indeterminate. A determinate
 * bar built on a timer is the thing that teaches people not to trust bars.
 *
 * The dialog stays open for the whole transition on purpose: a failure has to
 * be reported where the decision was made, and a spec waiting for it to vanish
 * is waiting for something that can only be true after the server answered
 * (CLAUDE.md).
 */
function CloseIssueDialog({
  issueId,
  disabled,
  blocking,
  placedCount,
  onDone,
}: {
  issueId: string;
  disabled: boolean;
  blocking: string | null;
  placedCount: number;
  onDone: (message: string, ok: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button
          disabled={disabled}
          data-testid="close-issue"
          title={disabled ? (blocking ?? undefined) : undefined}
        >
          <Lock className="size-4" />
          סגור גיליון
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid="close-issue-dialog"
          className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(31.25rem,calc(100vw-2rem))] -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-2"
        >
          <DialogPrimitive.Title className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold">
            <AlertTriangle className="size-5 text-status-error-fg" />
            לסגור את הגיליון?
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div className="mb-4 space-y-2 text-sm text-on-surface-variant">
              <p>
                הפעולה <strong>בלתי הפיכה למשתמש רגיל</strong> — רק מנהל יכול לפתוח גיליון סגור
                מחדש.
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>הגיליון יינעל לעריכה, שיבוץ, הסרה והעברה.</li>
                <li>
                  <Ltr>{placedCount}</Ltr> פרסומים יסומנו כ״פורסם״.
                </li>
                <li>ייווצר PDF סופי שיישמר לגיליון ויחליף קובץ קודם אם קיים.</li>
              </ul>
            </div>
          </DialogPrimitive.Description>

          {busy ? (
            <div className="mb-4" data-testid="close-progress">
              <div
                className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-container"
                role="progressbar"
                aria-label="מפיק את הגיליון"
              >
                <div className="h-full w-1/3 animate-pulse bg-primary" />
              </div>
              <p className="text-xs text-on-surface-variant">
                מרנדר עמודים → מייצר PDF → שומר. זה לוקח כמה שניות.
              </p>
            </div>
          ) : null}

          {error ? <InlineError>{error}</InlineError> : null}

          <div className="flex gap-3 border-t border-outline-variant pt-4">
            <Button
              disabled={busy}
              data-testid="confirm-close-issue"
              onClick={() =>
                startTransition(async () => {
                  const result = await closeIssueAction(issueId);
                  if (!result.ok) {
                    setError(result.message ?? "לא הצלחנו לסגור את הגיליון");
                    return;
                  }
                  setOpen(false);
                  onDone(result.message ?? "הגיליון נסגר", true);
                })
              }
            >
              {busy ? "מפיק PDF…" : "סגור והפק PDF"}
            </Button>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" disabled={busy}>
                ביטול
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
