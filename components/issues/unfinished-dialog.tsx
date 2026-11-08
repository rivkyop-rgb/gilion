"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, X } from "lucide-react";

import { Ltr } from "@/components/ui/ltr";
import { formatMoney } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

export type UnfinishedRow = {
  pageId: string;
  pageNumber: number;
  label: string;
  pageType: string;
  /** 0–100 — what is still free, the number a seller acts on. */
  freePercent: number;
  /** The biggest shape that still goes in, and its list price. */
  biggest: { shapeName: string; price: number | null } | null;
};

/**
 * Every page with room left, as a table in a window (08/11/2026).
 *
 * It was a row of chips in the strip above the canvas, with "+N" for the rest
 * — and under a success message the row wrapped and scrolled inside its own
 * 36px ("גלילה פנימית מאד לא נח, וכשיהיה 100 עמודים יהיה 100 שורות?"). The
 * strip now only says how many pages have room; the list opens on a button,
 * over the board, so opening it moves nothing under the pointer (CLAUDE.md).
 * Sorted by page number or by how much is free — the second is the question a
 * seller on the phone is asking.
 */
export function UnfinishedDialog({
  rows,
  onJump,
}: {
  rows: UnfinishedRow[];
  onJump: (pageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [byFree, setByFree] = useState(false);
  const sorted = [...rows].sort((a, b) =>
    byFree
      ? b.freePercent - a.freePercent || a.pageNumber - b.pageNumber
      : a.pageNumber - b.pageNumber,
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          data-testid="unfinished-open"
          className="shrink-0 rounded-full bg-surface-container-lowest px-3 py-0.5 text-xs font-semibold text-primary underline-offset-2 hover:underline"
        >
          פירוט העמודים
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-primary/40" />
        <DialogPrimitive.Content
          data-testid="unfinished-dialog"
          className="fixed inset-x-0 top-1/2 z-[71] mx-auto flex max-h-[85dvh] w-[min(44rem,calc(100vw-2rem))] -translate-y-1/2 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-2"
        >
          <div className="flex items-start justify-between gap-3 border-b border-outline-variant p-5">
            <div>
              <DialogPrimitive.Title className="font-serif text-xl font-semibold">
                איפה עוד יש מקום למכור
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-on-surface-variant">
                {rows.length === 1 ? (
                  "עמוד אחד"
                ) : (
                  <>
                    <Ltr>{rows.length}</Ltr> עמודים
                  </>
                )}{" "}
                עם שטח פנוי. לחיצה על שורה פותחת את העמוד.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="סגירה" className="rounded-sm p-1">
                <X className="size-5 text-on-surface-variant" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex items-center gap-2 px-5 pt-3 text-sm" role="group" aria-label="מיון">
            <span className="text-on-surface-variant">מיון:</span>
            {[
              { key: false, label: "לפי מספר עמוד" },
              { key: true, label: "הכי הרבה מקום קודם" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                aria-pressed={byFree === o.key}
                onClick={() => setByFree(o.key)}
                data-testid={o.key ? "unfinished-sort-free" : "unfinished-sort-page"}
                className={cn(
                  "rounded-full border px-3 py-1",
                  byFree === o.key
                    ? "border-primary bg-primary text-on-primary"
                    : "border-outline-variant hover:bg-surface-container",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-3">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-container-lowest text-xs text-on-surface-variant">
                <tr>
                  <th className="p-2 text-start font-medium">עמוד</th>
                  <th className="p-2 text-start font-medium">סוג</th>
                  <th className="p-2 text-start font-medium">פנוי</th>
                  <th className="p-2 text-start font-medium">הגודל הגדול שעוד נכנס</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.pageId}
                    className="cursor-pointer border-t border-outline-variant hover:bg-surface-container-low"
                    onClick={() => {
                      setOpen(false);
                      onJump(r.pageId);
                    }}
                    data-testid={`unfinished-row-${r.pageNumber}`}
                  >
                    <td className="whitespace-nowrap p-2 font-semibold">{r.label}</td>
                    <td className="p-2 text-on-surface-variant">{r.pageType}</td>
                    <td className="p-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-16 overflow-hidden rounded-full bg-surface-container"
                          aria-hidden
                        >
                          <span
                            className="block h-full rounded-full bg-status-success-fg"
                            style={{ width: `${r.freePercent}%` }}
                          />
                        </span>
                        <Ltr>{r.freePercent}%</Ltr>
                      </span>
                    </td>
                    <td className="p-2">
                      {r.biggest ? (
                        <>
                          {r.biggest.shapeName}
                          {r.biggest.price !== null ? (
                            <span className="text-on-surface-variant">
                              {" "}
                              · <Ltr>{formatMoney(r.biggest.price)}</Ltr>
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="p-2 text-end">
                      <button
                        type="button"
                        data-testid={`jump-to-page-${r.pageNumber}`}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-primary px-2 py-1 text-xs text-primary hover:bg-primary/5"
                      >
                        מעבר
                        <ArrowLeft className="size-3.5" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
