import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";
import { formatMoney } from "../orders/format";

/**
 * The three cards across the top of the dashboard (redesign, 29/09/2026).
 *
 * Each answers one question in one number and opens the screen that number
 * came from — the same rule as every other figure here (FR-20). They ADD to the
 * dashboard: the counted cards, the widgets and the table are all still below.
 */

/** Money that goes out in the chosen period, with the last eight weeks beside it. */
export function SalesCard({
  label,
  total,
  count,
  weeks,
  href,
}: {
  label: string;
  total: number;
  count: number;
  /** Oldest first; the last one is the current week and is drawn in gold. */
  weeks: number[];
  href: string;
}) {
  const max = Math.max(1, ...weeks);
  return (
    <Link
      href={href}
      data-testid="hero-sales"
      className="group flex gap-4 rounded-xl bg-primary p-5 text-on-primary transition-shadow hover:shadow-elevation-2"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm text-on-primary/75">{label}</span>
        <span className="text-[34px] leading-none font-bold tabular-nums">
          <Ltr>{formatMoney(total)}</Ltr>
        </span>
        <span className="text-sm text-state-active">
          <Ltr>{count}</Ltr> פרסומים
        </span>
      </div>
      {/* Eight weeks, so this week is read against the ones before it. The
          bars are decoration for the eye; the number is the answer. */}
      <div aria-hidden className="flex h-20 items-end gap-1 self-end">
        {weeks.map((w, i) => (
          <span
            key={i}
            className={cn(
              "w-2.5 rounded-t-sm",
              i === weeks.length - 1 ? "bg-brand-gold" : "bg-on-primary/25",
            )}
            style={{ height: `${Math.max(6, Math.round((w / max) * 100))}%` }}
          />
        ))}
      </div>
    </Link>
  );
}

/** What is owed across the business, and how much of it has already printed. */
export function OpenBillingCard({
  outstanding,
  customersInDebt,
}: {
  outstanding: number;
  customersInDebt: number;
}) {
  return (
    <Link
      href="/billing"
      data-testid="hero-billing"
      className="group flex flex-col gap-1.5 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 transition-shadow hover:shadow-elevation-2"
    >
      <span className="text-sm text-on-surface-variant">פתוח לגבייה</span>
      <span className="text-[30px] leading-none font-bold text-primary-container tabular-nums">
        <Ltr>{formatMoney(outstanding)}</Ltr>
      </span>
      <span className="text-sm text-on-surface-variant">
        {customersInDebt === 1 ? (
          "לקוח אחד עם יתרה"
        ) : (
          <>
            <Ltr>{customersInDebt}</Ltr> לקוחות עם יתרה
          </>
        )}
      </span>
      <span className="mt-auto flex items-center gap-1 text-sm font-semibold text-primary">
        למסך הגבייה
        <ArrowLeft className="size-4" aria-hidden />
      </span>
    </Link>
  );
}

/**
 * The next open issue: how much of it is placed, and a map of its pages.
 *
 * The map is the placement board's own `pageFill`, one cell per page — full
 * pages solid, pages with room left outlined — so a glance here and the board
 * it opens always agree.
 */
export function NextIssueCard({
  issue,
  pages,
}: {
  issue: {
    id: string;
    newspaperName: string;
    date: string;
    placedCount: number;
    plannedCount: number;
  } | null;
  pages: { number: number; percent: number; full: boolean }[] | null;
}) {
  if (!issue) {
    return (
      <div
        data-testid="hero-next-issue"
        className="flex flex-col justify-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-5"
      >
        <span className="text-sm text-on-surface-variant">הגיליון הבא</span>
        <span className="text-lg font-semibold">אין גיליון פתוח</span>
        <Link href="/issues/new" className="text-sm font-semibold text-primary">
          פתיחת גיליון חדש
        </Link>
      </div>
    );
  }
  const progress =
    issue.plannedCount > 0 ? Math.round((issue.placedCount / issue.plannedCount) * 100) : 0;
  const openPages = pages?.filter((p) => !p.full).length ?? 0;

  return (
    <Link
      href={`/issues/${issue.id}/board`}
      data-testid="hero-next-issue"
      className="group flex flex-col gap-2.5 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 transition-shadow hover:shadow-elevation-2"
    >
      <span className="text-sm text-on-surface-variant">הגיליון הבא · {issue.newspaperName}</span>
      <span className="text-xl font-bold text-primary-container">
        <Ltr>{issue.date}</Ltr> ·{" "}
        <Ltr>
          {issue.placedCount} מתוך {issue.plannedCount}
        </Ltr>{" "}
        שובצו
      </span>
      {pages && pages.length > 0 ? (
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.min(pages.length, 16)}, minmax(0, 1fr))` }}
          aria-label={`מפת ${pages.length} העמודים`}
        >
          {pages.map((p) => (
            <span
              key={p.number}
              title={`עמוד ${p.number} · ${p.full ? "מלא" : `${p.percent}% מלא`}`}
              className={cn(
                "h-7 rounded-sm border",
                p.full
                  ? "border-primary/40 bg-primary/35"
                  : p.percent > 0
                    ? "border-dashed border-primary/60 bg-status-info-bg"
                    : "border-dashed border-outline bg-surface-container-lowest",
              )}
            />
          ))}
        </div>
      ) : (
        <div className="h-2 overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full bg-brand-gold" style={{ width: `${progress}%` }} />
        </div>
      )}
      <span className="text-xs text-on-surface-variant">
        {pages ? (
          openPages === 0 ? (
            "כל העמודים מלאים"
          ) : openPages === 1 ? (
            "עמוד אחד עם מקום פנוי"
          ) : (
            <>
              <Ltr>{openPages}</Ltr> עמודים עם מקום פנוי
            </>
          )
        ) : (
          <>
            <Ltr>{progress}%</Ltr> שובצו
          </>
        )}
      </span>
    </Link>
  );
}
