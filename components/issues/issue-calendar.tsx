"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import type { IssueDateSuggestion } from "@/lib/domain/issue-schedule";
import {
  describeIssueDateAction,
  moveIssueDateAction,
} from "@/app/(internal)/issues/actions";
import { cn } from "@/lib/utils";

/**
 * What a date has to say for itself.
 *
 * Yom tov is not shown as a warning to click past — the offer never contains
 * one. What appears here is the eve of a chag (the paper comes out, and it is
 * the issue people fight over), a date off the newspaper's own schedule, and a
 * date that already has an issue.
 */
function DateNotes({ suggestion, taken }: { suggestion: IssueDateSuggestion; taken?: boolean }) {
  if (suggestion.notes.length === 0 && !taken) return null;

  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {taken ? (
        <li className="flex items-center gap-1.5 text-status-error-fg">
          <AlertTriangle className="size-3.5 shrink-0" />
          כבר קיים גיליון בתאריך הזה
        </li>
      ) : null}
      {suggestion.notes.map((note) => (
        <li
          key={note.kind}
          data-note={note.kind}
          className={cn(
            "flex items-center gap-1.5",
            note.kind === "no_paper"
              ? "text-status-error-fg"
              : note.kind === "erev_chag"
                ? "text-status-accent-fg"
                : "text-status-warning-fg",
          )}
        >
          {note.kind === "erev_chag" ? (
            <Sparkles className="size-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="size-3.5 shrink-0" />
          )}
          {note.message}
        </li>
      ))}
    </ul>
  );
}

/**
 * Moving an issue to another date.
 *
 * The confirmation names how many publications come with it, because that is
 * the part nobody expects: this changes the date a customer bought on an
 * approved order. It is the right behaviour — a paper delayed for a chag
 * delays its ads — and it is not a thing to discover afterwards.
 */
export function ChangeIssueDate({
  issueId,
  currentDate,
  onDone,
}: {
  issueId: string;
  /** yyyy-mm-dd. */
  currentDate: string;
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(currentDate);
  const [described, setDescribed] = useState<(IssueDateSuggestion & { taken: boolean }) | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    if (!open || !date) return;
    void (async () => {
      const result = await describeIssueDateAction(issueId, date);
      if (!cancelled) setDescribed(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [issueId, date, open]);

  if (!open) {
    return (
      <Button
        size="sm"
        variant="ghost"
        data-testid="change-issue-date"
        onClick={() => setOpen(true)}
      >
        <CalendarDays className="size-4" />
        שינוי תאריך הגיליון
      </Button>
    );
  }

  const blocked = !date || date === currentDate || !described?.usable || described?.taken;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="שינוי תאריך הגיליון"
      data-testid="change-date-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4"
    >
      <div className="w-full max-w-[30rem] rounded-lg bg-surface-container-lowest p-5 shadow-elevation-2">
        <h2 className="mb-2 font-serif text-xl font-semibold">שינוי תאריך הגיליון</h2>
        <p className="mb-3 rounded-lg bg-status-warning-bg p-2 text-xs text-status-warning-fg">
          הפרסומים של הגיליון יעברו לתאריך החדש יחד איתו, והשיבוצים יישמרו. זה משנה את התאריך שהלקוח
          קנה על הזמנות מאושרות, והפעולה תירשם ביומן הביקורת.
        </p>

        <Label htmlFor="new-issue-date">תאריך חדש</Label>
        <Input
          id="new-issue-date"
          data-testid="new-issue-date"
          type="date"
          dir="ltr"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {described ? <DateNotes suggestion={described} taken={described.taken} /> : null}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="mt-4 flex gap-2">
          <Button
            disabled={pending || blocked}
            data-testid="confirm-change-date"
            onClick={() =>
              startTransition(async () => {
                const result = await moveIssueDateAction(issueId, date);
                if (result.ok) {
                  setOpen(false);
                  onDone(result.message ?? "התאריך שונה");
                  router.refresh();
                  return;
                }
                setError(result.message ?? "לא הצלחנו לשנות את התאריך");
              })
            }
          >
            {pending ? "מעביר…" : "העברת הגיליון"}
          </Button>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}
