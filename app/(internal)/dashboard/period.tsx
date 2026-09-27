"use client";

import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Range = { from: string; to: string };

/**
 * The dashboard's period — for the whole screen, cards and table alike
 * (27/09/2026). The user asked to see "all the data, or filtered by other
 * dates", and meant the numbers at the top, not only the table under them.
 *
 * Three ranges one click away, and any other by date. The URL is the state,
 * and the table's own filters (newspaper, customer, status) ride along in
 * `keep`. Uncontrolled date fields, re-keyed on their value — see filters.tsx
 * for why a controlled date field here would argue with itself.
 */
export function DashboardPeriod({
  current,
  all,
  week,
  month,
  keep,
}: {
  current: Range;
  all: boolean;
  week: Range;
  month: Range;
  keep: Record<string, string>;
}) {
  const router = useRouter();

  const go = (next: { all?: boolean; from?: string; to?: string }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v && v !== "all") q.set(k, v);
    if (next.all) q.set("all", "1");
    else {
      if (next.from) q.set("from", next.from);
      if (next.to) q.set("to", next.to);
    }
    const s = q.toString();
    router.push(s ? `/dashboard?${s}` : "/dashboard", { scroll: false });
  };

  const is = (r: Range) => !all && current.from === r.from && current.to === r.to;
  const chip = (active: boolean) =>
    cn(
      "h-9 rounded-full px-4 text-sm font-medium ring-1 transition-colors",
      active
        ? "bg-primary text-on-primary ring-primary"
        : "bg-surface-container-lowest text-on-surface ring-outline-variant hover:bg-surface-container",
    );

  return (
    <div
      className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-3"
      data-testid="dashboard-period"
    >
      <span className="flex items-center gap-1.5 self-center text-sm font-medium">
        <CalendarRange className="size-4" aria-hidden />
        תקופה:
      </span>
      {/* "השבוע" is the bare dashboard, so it clears the dates rather than
          writing this week's into the address. */}
      <button
        type="button"
        data-testid="dates-this-week"
        aria-pressed={is(week)}
        className={chip(is(week))}
        onClick={() => go({})}
      >
        השבוע
      </button>
      <button
        type="button"
        data-testid="dates-month"
        aria-pressed={is(month)}
        className={chip(is(month))}
        onClick={() => go(month)}
      >
        החודש
      </button>
      <button
        type="button"
        data-testid="dates-all"
        aria-pressed={all}
        className={chip(all)}
        onClick={() => go({ all: true })}
      >
        כל הזמן
      </button>

      <form
        className="flex flex-wrap items-end gap-2 border-s border-outline-variant ps-3"
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          const from = String(data.get("from") ?? "");
          const to = String(data.get("to") ?? "");
          // Both cleared is "no dates" — everything.
          go(from || to ? { from, to } : { all: true });
        }}
      >
        <label className="text-xs text-on-surface-variant">
          מתאריך
          <Input
            key={`from-${current.from}`}
            name="from"
            type="date"
            dir="ltr"
            defaultValue={current.from}
            data-testid="filter-from"
            className="mt-1 w-40"
          />
        </label>
        <label className="text-xs text-on-surface-variant">
          עד תאריך
          <Input
            key={`to-${current.to}`}
            name="to"
            type="date"
            dir="ltr"
            defaultValue={current.to}
            data-testid="filter-to"
            className="mt-1 w-40"
          />
        </label>
        <Button type="submit" variant="secondary" data-testid="apply-period">
          הצגה
        </Button>
      </form>
    </div>
  );
}
