"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarDays, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import type { IssueDateSuggestion } from "@/lib/domain/issue-schedule";
import {
  describeIssueDateAction,
  moveIssueDateAction,
  nextIssueOptionsAction,
  openNextIssueAction,
} from "@/app/(internal)/issues/actions";
import { cn } from "@/lib/utils";

const DATE = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

const formatIso = (iso: string) => DATE.format(new Date(`${iso}T00:00:00.000Z`));

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
 * The offer that appears when an issue is closed: open the next one.
 *
 * ── Why it is offered and not done ───────────────────────────────────────────
 * The date is a guess — a good one, from the newspaper's own schedule with yom
 * tov taken out — but it is still the publisher's call, and a paper that comes
 * out a day late for a chag is exactly the case where the guess is wrong. So
 * the system proposes, says what it knows about the date, and waits.
 *
 * The composition is copied from the issue just closed: a weekly that runs 16
 * pages runs 16 next week, and re-picking them every time is the busywork this
 * removes.
 */
export function NextIssueOffer({ issueId, onClose }: { issueId: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<Awaited<ReturnType<typeof nextIssueOptionsAction>> | null>(
    null,
  );
  const [chosen, setChosen] = useState<string>("");
  const [custom, setCustom] = useState<(IssueDateSuggestion & { taken: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await nextIssueOptionsAction(issueId);
      if (cancelled) return;
      setState(result);
      setChosen(result.suggested?.date ?? result.options[0]?.date ?? "");
    })();
    return () => {
      cancelled = true;
    };
  }, [issueId]);

  // A typed date gets the same reading the offered ones got. The clearing case
  // is handled in the async body too, so nothing sets state synchronously in an
  // effect — that is a cascading render, and React says so.
  const offered = state?.options.find((o) => o.date === chosen) ?? null;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const described = chosen && !offered ? await describeIssueDateAction(issueId, chosen) : null;
      if (!cancelled) setCustom(described);
    })();
    return () => {
      cancelled = true;
    };
  }, [issueId, chosen, offered]);

  const current = offered ?? custom;
  const blocked = current ? !current.usable || current.taken : !chosen;

  const open = () =>
    startTransition(async () => {
      const result = await openNextIssueAction(issueId, chosen);
      if (result.ok && result.issueId) {
        router.push(`/issues/${result.issueId}/board`);
        return;
      }
      setError(result.message ?? "לא הצלחנו לפתוח את הגיליון הבא");
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="פתיחת הגיליון הבא"
      data-testid="next-issue-offer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4"
    >
      <div className="w-full max-w-[32rem] rounded-lg bg-surface-container-lowest p-5 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
            <CalendarDays className="size-5" />
            הגיליון נסגר — לפתוח את הבא?
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            data-testid="next-issue-dismiss"
            className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <X className="size-4" />
          </button>
        </div>

        {state === null ? (
          <p className="text-sm text-on-surface-variant">בודק מתי יוצא הגיליון הבא…</p>
        ) : state.options.length === 0 ? (
          <p className="text-sm text-on-surface-variant" data-testid="no-schedule">
            ל{state.newspaperName} אין ימי הוצאה מוגדרים, ולכן אין ממה לחשב את התאריך הבא. אפשר
            לפתוח גיליון ידנית ולבחור תאריך.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-on-surface-variant">
              לפי ימי ההוצאה של {state.newspaperName}. הגיליון החדש ייפתח עם אותם עמודים.
            </p>

            <ul className="mb-3 space-y-1" data-testid="next-issue-options">
              {state.options.map((option) => (
                <li key={option.date}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm",
                      chosen === option.date
                        ? "border-primary bg-status-accent-bg"
                        : "border-outline-variant hover:bg-surface-container",
                      option.taken ? "opacity-60" : "",
                    )}
                  >
                    <input
                      type="radio"
                      name="next-issue-date"
                      className="mt-1"
                      data-testid={`next-issue-${option.date}`}
                      checked={chosen === option.date}
                      onChange={() => setChosen(option.date)}
                    />
                    <span className="min-w-0">
                      <Ltr>{formatIso(option.date)}</Ltr>
                      <DateNotes suggestion={option} taken={option.taken} />
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <Label htmlFor="next-issue-custom">או תאריך אחר</Label>
            <Input
              id="next-issue-custom"
              data-testid="next-issue-custom"
              type="date"
              dir="ltr"
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
            />
            {custom ? <DateNotes suggestion={custom} taken={custom.taken} /> : null}
          </>
        )}

        {error ? <InlineError>{error}</InlineError> : null}

        <div className="mt-4 flex gap-2">
          <Button
            onClick={open}
            disabled={pending || blocked || state === null || state.options.length === 0}
            data-testid="open-next-issue"
          >
            {pending ? "פותח…" : "פתיחת הגיליון הבא"}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            לא עכשיו
          </Button>
        </div>
      </div>
    </div>
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
        className="w-full"
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
      <div className="w-full max-w-[30rem] rounded-lg bg-surface-container-lowest p-5 shadow-xl">
        <h2 className="mb-2 font-serif text-xl font-semibold">שינוי תאריך הגיליון</h2>
        <p className="mb-3 rounded-md bg-status-warning-bg p-2 text-xs text-status-warning-fg">
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
