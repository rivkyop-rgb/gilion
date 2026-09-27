"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DateOption = { date: string; count: number };

/** "2027-06-15" → "15.06.2027" — a date the paper printed on, in the reader's order. */
function showDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * "Who is in THIS issue": a newspaper, then one of the dates it has (or will
 * have) publications on, then a search inside what that leaves (27/09/2026).
 *
 * The dates come from the publications themselves — a date nobody bought is
 * not offered — split into what is still coming (nearest first) and what has
 * already run (latest first), each with how many are in it. Choosing a date
 * sets from = to = that day, so the rest of the page (the banner, the filter
 * chips, the count) reads it like any other date filter.
 *
 * The URL stays the whole state; `keep` carries every other parameter along.
 */
export function IssueDateBar({
  basePath,
  newspapers,
  datesByNewspaper,
  newspaper,
  date,
  q,
  today,
  keep,
}: {
  basePath: string;
  newspapers: Array<{ id: string; name: string }>;
  datesByNewspaper: Record<string, DateOption[]>;
  newspaper: string;
  /** The chosen day, when from and to are the same day; "" otherwise. */
  date: string;
  q: string;
  /** yyyy-MM-dd in Jerusalem — where "coming" ends and "ran" begins. */
  today: string;
  keep: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [text, setText] = useState(q);

  const go = (next: { newspaper?: string; date?: string; q?: string }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v && v !== "all") params.set(k, v);
    const paper = next.newspaper ?? newspaper;
    const day = next.date ?? date;
    const query = next.q ?? text;
    if (paper && paper !== "all") params.set("newspaper", paper);
    if (day) {
      params.set("from", day);
      params.set("to", day);
    }
    if (query.trim()) params.set("q", query.trim());
    const s = params.toString();
    router.push(s ? `${basePath}?${s}` : basePath, { scroll: false });
  };

  const dates = newspaper !== "all" ? (datesByNewspaper[newspaper] ?? []) : [];
  const coming = dates.filter((d) => d.date >= today);
  const ran = dates.filter((d) => d.date < today).reverse();

  return (
    <div
      className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-4"
      data-testid="issue-date-bar"
    >
      <label className="text-xs text-on-surface-variant">
        עיתון
        <select
          data-testid="bar-newspaper"
          value={newspaper}
          // A different paper has different dates: the chosen one is dropped.
          onChange={(e) => go({ newspaper: e.target.value, date: "" })}
          className="mt-1 block h-10 min-w-44 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
        >
          <option value="all">כל העיתונים</option>
          {newspapers.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-on-surface-variant">
        תאריך הגיליון
        <select
          data-testid="bar-date"
          value={date}
          disabled={newspaper === "all"}
          onChange={(e) => go({ date: e.target.value })}
          className="mt-1 block h-10 min-w-56 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface disabled:opacity-50"
        >
          <option value="">
            {newspaper === "all"
              ? "בחרי קודם עיתון"
              : dates.length === 0
                ? "אין תאריכים עם פרסומים"
                : "כל התאריכים"}
          </option>
          {coming.length > 0 ? (
            <optgroup label="קרובים — מי אמור לפרסם">
              {coming.map((d) => (
                <option key={d.date} value={d.date}>
                  {showDate(d.date)} · {d.count === 1 ? "פרסום אחד" : `${d.count} פרסומים`}
                </option>
              ))}
            </optgroup>
          ) : null}
          {ran.length > 0 ? (
            <optgroup label="שיצאו — מי פרסם">
              {ran.map((d) => (
                <option key={d.date} value={d.date}>
                  {showDate(d.date)} · {d.count === 1 ? "פרסום אחד" : `${d.count} פרסומים`}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>

      <form
        className="flex min-w-64 flex-1 items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: text });
        }}
      >
        <label className="flex-1 text-xs text-on-surface-variant">
          חיפוש בתוצאות
          <span className="relative mt-1 block">
            <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-outline" />
            <Input
              data-testid="bar-search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="שם לקוח, איש קשר, מספר הזמנה או גודל"
              className="ps-9"
            />
          </span>
        </label>
        <Button type="submit" variant="secondary" data-testid="bar-search-apply">
          חיפוש
        </Button>
      </form>
    </div>
  );
}
