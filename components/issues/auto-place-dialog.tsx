"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Wand2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";

export type AutoPlacePageOption = {
  id: string;
  label: string;
  pageTypeName: string;
  /** 0–100: how much is sold already. */
  percent: number;
};

/**
 * Where the auto-placer may put things (27/09/2026): anywhere — growing the
 * issue with inner pages until everything fits — or only on pages chosen here,
 * where nothing is added and what does not fit is reported.
 *
 * A modal, not a panel beside the board: opening something next to the page
 * resizes the page (CLAUDE.md).
 */
export function AutoPlaceDialog({
  open,
  onOpenChange,
  pages,
  waiting,
  busy,
  onRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: AutoPlacePageOption[];
  /** How many publications are waiting to be placed. */
  waiting: number;
  busy: boolean;
  /** `null` — every page, growing the issue; otherwise only these pages. */
  onRun: (onlyPageIds: string[] | null) => void;
}) {
  const [scope, setScope] = useState<"all" | "chosen">("all");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const canRun = !busy && (scope === "all" || chosen.size > 0);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid="auto-place-dialog"
          className="fixed inset-x-0 top-1/2 z-50 mx-auto flex max-h-[85dvh] w-[min(34rem,calc(100vw-2rem))] -translate-y-1/2 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-2"
        >
          <div className="flex items-start justify-between gap-3 border-b border-outline-variant p-5">
            <div>
              <DialogPrimitive.Title className="flex items-center gap-2 font-serif text-lg font-semibold">
                <Wand2 className="size-5" aria-hidden />
                שיבוץ אוטומטי
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-on-surface-variant">
                {waiting === 1 ? "פרסום אחד ממתין" : `${waiting} פרסומים ממתינים`} לשיבוץ. איפה לשבץ
                אותם?
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" aria-label="סגירה">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-5" role="radiogroup">
            {(
              [
                [
                  "all",
                  "בכל העמודים",
                  "אם אין מספיק מקום, יתווספו עמודים פנימיים (ארבעה בכל פעם) עד שהכול ייכנס.",
                ],
                [
                  "chosen",
                  "רק בעמודים שאבחר",
                  "לא יתווספו עמודים. מה שלא ייכנס יישאר ברשימה, והמערכת תגיד כמה.",
                ],
              ] as const
            ).map(([value, title, body]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                data-testid={`auto-place-scope-${value}`}
                onClick={() => setScope(value)}
                className={cn(
                  "flex w-full flex-col gap-1 rounded-lg border p-3 text-start transition",
                  scope === value
                    ? "border-secondary bg-state-active/40"
                    : "border-outline-variant hover:border-brand-gold",
                )}
              >
                <span className="font-semibold">{title}</span>
                <span className="text-xs text-on-surface-variant">{body}</span>
              </button>
            ))}

            {scope === "chosen" ? (
              <fieldset className="rounded-lg border border-outline-variant p-3">
                <legend className="px-1 text-xs text-on-surface-variant">העמודים לשיבוץ</legend>
                <div className="mb-2 flex gap-3 text-xs">
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setChosen(new Set(pages.map((p) => p.id)))}
                  >
                    כולם
                  </button>
                  <button type="button" className="underline" onClick={() => setChosen(new Set())}>
                    אף אחד
                  </button>
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {pages.map((p) => (
                    <li key={p.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={chosen.has(p.id)}
                          data-testid={`auto-place-page-${p.label}`}
                          onChange={() => toggle(p.id)}
                        />
                        <span className="font-medium">{p.label}</span>
                        <span className="text-xs text-on-surface-variant">
                          {p.pageTypeName} · <Ltr>{100 - p.percent}%</Ltr> פנוי
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ) : null}
          </div>

          <div className="flex items-center gap-3 border-t border-outline-variant p-5">
            <Button
              disabled={!canRun}
              data-testid="auto-place-run"
              onClick={() => onRun(scope === "all" ? null : [...chosen])}
            >
              <Wand2 className="size-4" />
              {busy ? "משבצת…" : "שיבוץ"}
            </Button>
            {scope === "chosen" && chosen.size === 0 ? (
              <span className="text-xs text-on-surface-variant">בחרי לפחות עמוד אחד.</span>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
