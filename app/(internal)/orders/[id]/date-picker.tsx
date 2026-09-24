"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDays,
  hasSchedule,
  monthDays,
  todayIso,
  WEEKDAYS,
  WEEKDAY_SHORT,
} from "@/lib/domain/publication-days";
import { jewishMonth } from "@/lib/domain/jewish-calendar";

/**
 * Pick many publication dates at once.
 *
 * A customer who buys "a package" is not buying a recurrence — it is every
 * other week, or holiday eves, or eight dates that only make sense to them.
 * So the control is a calendar you tick, not a repeat rule: any pattern a
 * person can point at is expressible, and the system needs to know nothing
 * about holidays to support "only before holidays".
 *
 * Print days are the ones the paper actually comes out on. Everything else is
 * still clickable, because special editions exist — it just costs an explicit
 * acknowledgement, which is stored on the line so a later schedule change
 * cannot retroactively make a deliberate choice look like a mistake.
 */
export function MultiDatePicker({
  selected,
  onChange,
  publicationDays,
  newspaperName,
  takenDates,
}: {
  selected: string[];
  onChange: (dates: string[]) => void;
  publicationDays: number[];
  newspaperName: string;
  takenDates: string[];
}) {
  const today = todayIso();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const days = useMemo(
    () => monthDays(cursor.year, cursor.month, publicationDays, today),
    [cursor, publicationDays, today],
  );

  // One pass for the whole month — see jewishMonth. A per-cell lookup rebuilds
  // the year's holiday table 31 times over.
  const jewish = useMemo(() => jewishMonth(cursor.year, cursor.month), [cursor]);

  const scheduled = hasSchedule(publicationDays);
  const taken = useMemo(() => new Set(takenDates), [takenDates]);
  const chosen = useMemo(() => new Set(selected), [selected]);

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const toggle = (iso: string) =>
    onChange(chosen.has(iso) ? selected.filter((d) => d !== iso) : [...selected, iso].sort());

  /** Tick every remaining print day in the month — the common "all of them" case. */
  const selectMonth = () => {
    const addable = days
      .filter(
        (d) =>
          d.isPublicationDay &&
          !d.isPast &&
          !taken.has(d.iso) &&
          jewish.get(d.iso)?.kind !== "chag",
      )
      .map((d) => d.iso);
    onChange([...new Set([...selected, ...addable])].sort());
  };

  const monthLabel = new Intl.DateTimeFormat("he-IL", {
    month: "long",
    year: "numeric",
  }).format(new Date(cursor.year, cursor.month, 1));

  // The calendar grid always starts on Sunday, so the leading blanks are simply
  // the first day's weekday number.
  const lead = days[0]?.weekday ?? 0;

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {/* RTL: "previous" sits at the start of the line, which is the right. */}
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="חודש קודם"
          data-testid="prev-month"
          className="rounded-sm p-1 hover:bg-surface-container"
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="text-sm font-semibold" data-testid="calendar-month">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="חודש הבא"
          data-testid="next-month"
          className="rounded-sm p-1 hover:bg-surface-container"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-on-surface-variant">
        {WEEKDAYS.map((d) => (
          <span key={d}>{WEEKDAY_SHORT[d]}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1" data-testid="calendar-grid">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const isChosen = chosen.has(d.iso);
          const isTaken = taken.has(d.iso);
          const heb = jewish.get(d.iso);
          // A chag is not a scheduling preference — no paper is printed, so the
          // day is closed outright rather than merely warned about.
          const isChag = heb?.kind === "chag";
          const disabled = d.isPast || isTaken || isChag;
          return (
            <button
              key={d.iso}
              type="button"
              disabled={disabled}
              onClick={() => toggle(d.iso)}
              data-testid={`day-${d.iso}`}
              data-chosen={isChosen || undefined}
              data-kind={heb?.kind}
              title={
                isChag
                  ? `${heb?.holiday} — לא יוצא עיתון בחג`
                  : isTaken
                    ? "התאריך הזה כבר בהזמנה"
                    : heb?.kind === "erev_chag"
                      ? `${heb.holiday} — יום פרסום מבוקש`
                      : scheduled && !d.isPublicationDay
                        ? `אינו יום הדפסה — ${formatDays(publicationDays)}`
                        : undefined
              }
              className={cn(
                "flex h-14 flex-col items-center justify-center rounded-sm px-0.5 text-sm leading-tight transition-colors",
                disabled && "cursor-not-allowed opacity-40",
                isChosen
                  ? "bg-primary font-semibold text-on-primary"
                  : isChag
                    ? "bg-status-muted-bg text-status-muted-fg"
                    : heb?.kind === "erev_chag"
                      ? "bg-status-debt-bg text-status-debt-fg hover:brightness-95"
                      : scheduled && d.isPublicationDay
                        ? "bg-status-info-bg text-status-info-fg hover:brightness-95"
                        : "text-on-surface-variant hover:bg-surface-container",
                // A non-print day is drawn as an outline: still reachable, but
                // visibly not one of the paper's own dates.
                !isChosen &&
                  scheduled &&
                  !d.isPublicationDay &&
                  !isChag &&
                  "ring-1 ring-outline-variant",
                isTaken && "line-through",
              )}
            >
              <span className="ltr-isolate">{d.day}</span>
              <span className="text-[9px] opacity-70">{heb?.hebrew}</span>
              {heb?.holiday ? (
                <span className="w-full truncate text-[8px] font-medium">{heb.holiday}</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant pt-2">
        <p className="text-xs text-on-surface-variant">
          {scheduled ? `${newspaperName} — ${formatDays(publicationDays)}` : "לא הוגדרו ימי הדפסה"}
        </p>
        <p className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-on-surface-variant">
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-[2px] bg-status-info-bg" /> יום הדפסה
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-[2px] bg-status-debt-bg" /> ערב חג
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2.5 rounded-[2px] bg-status-muted-bg" /> חג — אין עיתון
          </span>
        </p>
        {scheduled ? (
          <button
            type="button"
            onClick={selectMonth}
            data-testid="select-whole-month"
            className="text-xs font-medium text-primary underline"
          >
            כל ימי ההדפסה בחודש
          </button>
        ) : null}
      </div>
    </div>
  );
}
