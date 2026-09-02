"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ltr } from "@/components/ui/ltr";
import { defaultPageTypeIds } from "@/lib/domain/issue-layout";
import { createIssueAction } from "../actions";

export type NewspaperOption = {
  id: string;
  name: string;
  columns: number;
  rows: number;
  pageTypes: Array<{ id: string; name: string }>;
};

type Preview = { planned: number; exists: boolean };

/**
 * Opening an issue: newspaper, date, and the pages it will be made of.
 *
 * The live preview underneath is the point of the screen. Opening an issue for
 * a date with nothing planned is legal but almost always a typo in the date,
 * and the only moment that is cheap to notice is before the issue exists.
 */
export function NewIssueForm({
  newspapers,
  preview,
}: {
  newspapers: NewspaperOption[];
  preview: (newspaperId: string, date: string) => Promise<Preview>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [newspaperId, setNewspaperId] = useState(newspapers[0]?.id ?? "");
  const [date, setDate] = useState("");
  // Cover, an inner spread, and a back — the smallest thing anyone actually
  // prints: one sheet folded once is four sides.
  const [pages, setPages] = useState<string[]>(defaultPageTypeIds(newspapers[0]?.pageTypes ?? []));
  const [info, setInfo] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const paper = newspapers.find((n) => n.id === newspaperId);

  // Pages reset with the newspaper, in the change handler rather than in an
  // effect: a page type belongs to one newspaper, and carrying the previous
  // selection over would submit ids that cannot exist.
  /**
   * Adopts a value that reached the field before React was listening.
   *
   * A controlled input can end up holding a value React does not know about:
   * anything that writes to the DOM before hydration — a browser restoring a
   * form on back-navigation, an autofill, a test typing quickly — lands in the
   * element, and React then initialises its value tracker FROM that element.
   * The tracker and the DOM agree, the state does not, and because they agree
   * no further input event is ever fired. The field shows a date, the preview
   * below it says "choose a date", and the submit button refuses — a page
   * arguing with itself, with nothing on screen to explain it.
   *
   * A ref callback runs on mount, before that divergence can be observed, and
   * the guard makes it idempotent: once the state matches, it does nothing.
   */
  const adoptTypedDate = (el: HTMLInputElement | null) => {
    if (el && el.value && el.value !== date) setDate(el.value);
  };

  const chooseNewspaper = (id: string) => {
    setNewspaperId(id);
    const next = newspapers.find((n) => n.id === id);
    setPages(defaultPageTypeIds(next?.pageTypes ?? []));
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = newspaperId && date ? await preview(newspaperId, date) : null;
      if (!cancelled) setInfo(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [newspaperId, date, preview]);

  const submit = () => {
    setError(null);
    const form = new FormData();
    form.set("newspaperId", newspaperId);
    form.set("date", date);
    for (const pageTypeId of pages) form.append("pageTypeIds", pageTypeId);

    startTransition(async () => {
      const result = await createIssueAction({}, form);
      if (result.ok && result.issueId) {
        router.push(`/issues/${result.issueId}/board`);
        return;
      }
      setError(result.message ?? Object.values(result.errors ?? {})[0] ?? "לא הצלחנו לפתוח גיליון");
    });
  };

  const canSubmit = Boolean(newspaperId && date && pages.length > 0) && !info?.exists;

  return (
    <div className="max-w-2xl space-y-5 rounded-lg border border-outline-variant bg-surface-container-lowest p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="newspaperId">עיתון</Label>
          <select
            id="newspaperId"
            data-testid="issue-newspaper"
            value={newspaperId}
            onChange={(e) => chooseNewspaper(e.target.value)}
            className="h-10 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm"
          >
            {newspapers.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label htmlFor="issue-date">תאריך הגיליון</Label>
          <Input
            id="issue-date"
            data-testid="issue-date"
            type="date"
            dir="ltr"
            ref={adoptTypedDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">הרכבת העמודים</legend>
        <p className="mb-2 text-xs text-on-surface-variant">
          העמודים ממוספרים לפי הסדר כאן. עמוד <Ltr>1</Ltr> הוא השער והאחרון הוא הגב — שניהם צדי החוץ
          של הגיליון המקופל ולכן נראים לבד; מה שביניהם נראה בכפולות.
        </p>

        {paper && paper.pageTypes.length === 0 ? (
          <p className="flex items-center gap-2 rounded-md bg-status-warning-bg p-3 text-sm text-status-warning-fg">
            <AlertTriangle className="size-4 shrink-0" />
            לעיתון הזה אין סוגי עמודים, ולכן אי אפשר להרכיב לו גיליון. אפשר להוסיף אותם בהגדרות
            העיתון.
          </p>
        ) : (
          <ul className="space-y-2" data-testid="page-list">
            {pages.map((pageTypeId, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-sm text-on-surface-variant">
                  עמוד <Ltr>{index + 1}</Ltr>
                  {index === 0 ? " (שער)" : index === pages.length - 1 ? " (גב)" : ""}
                </span>
                <select
                  aria-label={`סוג העמוד של עמוד ${index + 1}`}
                  data-testid={`page-type-${index}`}
                  value={pageTypeId}
                  onChange={(e) =>
                    setPages(pages.map((p, i) => (i === index ? e.target.value : p)))
                  }
                  className="h-9 flex-1 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-sm"
                >
                  {paper?.pageTypes.map((pt) => (
                    <option key={pt.id} value={pt.id}>
                      {pt.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={`הסרת עמוד ${index + 1}`}
                  data-testid={`remove-page-${index}`}
                  onClick={() => setPages(pages.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {paper && paper.pageTypes.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            data-testid="add-page"
            onClick={() => setPages([...pages, paper.pageTypes[0]!.id])}
          >
            <Plus className="size-4" />
            הוספת עמוד
          </Button>
        ) : null}
      </fieldset>

      <div
        className="rounded-md border border-outline-variant bg-surface-container p-3 text-sm"
        data-testid="issue-preview"
      >
        <p>
          הגריד שייווצר:{" "}
          <Ltr>
            {paper?.columns ?? 0} × {paper?.rows ?? 0}
          </Ltr>{" "}
          — <Ltr>{pages.length}</Ltr> עמודים, <Ltr>{viewCount(pages.length)}</Ltr> תצוגות
        </p>
        {info ? (
          info.exists ? (
            <p className="mt-1 flex items-center gap-2 text-status-error-fg">
              <AlertTriangle className="size-4 shrink-0" />
              כבר קיים גיליון לעיתון הזה בתאריך הזה.
            </p>
          ) : info.planned > 0 ? (
            <p className="mt-1 text-on-surface-variant">
              <Ltr>{info.planned}</Ltr> פרסומים כבר מתוכננים לתאריך הזה.
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-2 text-status-warning-fg">
              <AlertTriangle className="size-4 shrink-0" />
              אין אף פרסום מתוכנן לתאריך הזה. אפשר לפתוח את הגיליון בכל זאת.
            </p>
          )
        ) : (
          <p className="mt-1 text-on-surface-variant">בחרי תאריך כדי לראות מה כבר מתוכנן.</p>
        )}
      </div>

      {error ? (
        <p role="alert" data-testid="issue-error" className="text-sm text-status-error-fg">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={!canSubmit || pending}
          data-testid="create-issue"
        >
          {pending ? "פותח…" : "פתיחת הגיליון"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/issues")}>
          ביטול
        </Button>
      </div>
    </div>
  );
}

/** Cover, back, and the inner pages in pairs — see lib/domain/issue-layout.ts. */
function viewCount(pageCount: number): number {
  if (pageCount <= 2) return pageCount;
  return 2 + Math.ceil((pageCount - 2) / 2);
}
