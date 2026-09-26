"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowUpDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Ltr } from "@/components/ui/ltr";
import { pageLabel } from "@/lib/domain/issue-layout";
import { counted } from "@/lib/domain/hebrew-count";
import { cn } from "@/lib/utils";

export type OrderablePage = {
  id: string;
  number: number;
  pageTypeName: string;
  /** 0–100: how much of the page is sold, as on the strip. */
  fillPercent: number;
  /** The ads on it, in grid cells — drawn small so a page is recognisable. */
  blocks: Array<{ col: number; row: number; cols: number; rows: number }>;
};

/**
 * The page in miniature: its proportion, and every ad on it as a block.
 *
 * Without it every inner page is the same card reading "פנימי", and moving one
 * looks like nothing happened (the user, 26/09/2026). With it the page you
 * dragged is the page with THAT layout, wherever it lands.
 *
 * Column 0 is the page's RIGHT edge (RTL, docs: rtl-grid-direction), so blocks
 * are placed with `insetInlineStart`, which is the right in Hebrew.
 */
function MiniPage({
  blocks,
  grid,
}: {
  blocks: OrderablePage["blocks"];
  grid: { columns: number; rows: number };
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-sm border border-outline-variant bg-surface-container-lowest"
      style={{ aspectRatio: `${grid.columns} / ${grid.rows}` }}
      aria-hidden
    >
      {blocks.map((b, i) => (
        <span
          key={i}
          className="absolute rounded-[2px] bg-primary/70"
          style={{
            insetInlineStart: `${(b.col / grid.columns) * 100}%`,
            top: `${(b.row / grid.rows) * 100}%`,
            inlineSize: `${(b.cols / grid.columns) * 100}%`,
            blockSize: `${(b.rows / grid.rows) * 100}%`,
          }}
        />
      ))}
      {blocks.length === 0 ? (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-outline">
          ריק
        </span>
      ) : null}
    </div>
  );
}

/** Moves `id` so that it lands at 1-based `position`. */
function moveTo(order: string[], id: string, position: number): string[] {
  const without = order.filter((x) => x !== id);
  const at = Math.min(Math.max(position, 1), order.length) - 1;
  without.splice(at, 0, id);
  return without;
}

/**
 * Rearranging an issue's pages — by dragging a card, or by typing the number it
 * should become — and nothing is written until it is confirmed, twice.
 *
 * A modal and not a panel under the strip: anything that opens beside the
 * board changes the room the printed page is fitted into, and the canvas
 * resizes under the pointer (CLAUDE.md, "הודעה שנפתחת מעל קנבס"). A dialog
 * takes no room from the layout at all.
 *
 * Placements belong to a PAGE, not to a page number, so they travel with the
 * page they sit on. The confirmation says so, because "will my ads move?" is
 * the question anyone reordering is actually asking.
 */
export function PageOrderDialog({
  pages,
  grid,
  open,
  initialOrder,
  onOpenChange,
  onConfirm,
}: {
  /** In the issue's current order. */
  pages: OrderablePage[];
  grid: { columns: number; rows: number };
  open: boolean;
  /** A starting arrangement — the drag that opened the dialog from the strip. */
  initialOrder: string[] | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (orderedPageIds: string[]) => Promise<{ message?: string } | void>;
}) {
  const current = pages.map((p) => p.id);
  const [order, setOrder] = useState<string[]>(initialOrder ?? current);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // What is being typed into each number box, until it is applied.
  const [typed, setTyped] = useState<Record<string, string>>({});

  const byId = new Map(pages.map((p) => [p.id, p]));
  const moved = order.filter((id, i) => current[i] !== id).length;
  /** "3 ← 6" for every page whose number changes — the whole change at a glance. */
  const moves = order
    .map((id, i) => ({ from: byId.get(id)!.number, to: i + 1 }))
    .filter((m) => m.from !== m.to);

  const apply = (id: string) => {
    const raw = typed[id];
    setTyped((t) => {
      const next = { ...t };
      delete next[id];
      return next;
    });
    const n = Number(raw);
    if (raw === undefined || raw.trim() === "" || !Number.isInteger(n)) return;
    setOrder((o) => moveTo(o, id, n));
  };

  const drop = (targetId: string) => {
    if (dragging && dragging !== targetId) {
      setOrder((o) => moveTo(o, dragging, o.indexOf(targetId) + 1));
    }
    setDragging(null);
    setOver(null);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid="page-order-dialog"
          className="fixed inset-x-0 top-1/2 z-50 mx-auto flex max-h-[85dvh] w-[min(56rem,calc(100vw-2rem))] -translate-y-1/2 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-2"
        >
          <div className="flex items-start justify-between gap-3 border-b border-outline-variant p-5">
            <div>
              <DialogPrimitive.Title className="flex items-center gap-2 font-serif text-lg font-semibold">
                <ArrowUpDown className="size-5" aria-hidden />
                סידור עמודים
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-on-surface-variant">
                גררי עמוד למקום אחר, או כתבי מתחתיו את המספר שהוא צריך לקבל. שום דבר לא נשמר עד
                האישור.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" aria-label="סגירה">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <ol className="grid flex-1 grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3 overflow-y-auto p-5">
            {order.map((id, index) => {
              const page = byId.get(id)!;
              const position = index + 1;
              const wasElsewhere = page.number !== position;
              return (
                <li
                  key={id}
                  data-testid={`order-card-${page.number}`}
                  draggable
                  onDragStart={() => setDragging(id)}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    drop(id);
                  }}
                  className={cn(
                    "flex cursor-grab flex-col gap-2 rounded-lg border bg-surface-container-lowest p-2 text-xs transition-colors",
                    dragging === id && "opacity-40",
                    over === id && dragging && dragging !== id
                      ? "border-primary ring-2 ring-primary"
                      : wasElsewhere
                        ? "border-2 border-secondary bg-state-active/30 shadow-elevation-1"
                        : "border-outline-variant",
                  )}
                >
                  <span className="flex items-center justify-between gap-1">
                    <span className="font-semibold">{pageLabel(position, order.length)}</span>
                    {wasElsewhere ? (
                      <span
                        data-testid={`order-moved-${page.number}`}
                        className="inline-flex items-center gap-0.5 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-on-primary"
                        title={`עמוד ${page.number} עובר למקום ${position}`}
                      >
                        <Ltr>{page.number}</Ltr>
                        <ArrowLeft className="size-3" aria-hidden />
                        <Ltr>{position}</Ltr>
                      </span>
                    ) : null}
                  </span>
                  <MiniPage blocks={page.blocks} grid={grid} />
                  <span className="text-on-surface-variant">
                    {page.pageTypeName} · <Ltr>{page.fillPercent}%</Ltr> נמכר
                  </span>
                  <label className="flex items-center gap-1.5">
                    <span className="text-on-surface-variant">מספר</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={order.length}
                      dir="ltr"
                      data-testid={`order-number-${page.number}`}
                      value={typed[id] ?? String(position)}
                      onChange={(e) => setTyped((t) => ({ ...t, [id]: e.target.value }))}
                      onBlur={() => apply(id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          apply(id);
                        }
                      }}
                      className="h-8 w-14 rounded-lg border border-outline-variant bg-surface-container px-2 text-center text-sm"
                    />
                  </label>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant p-5">
            <ConfirmDialog
              testId="confirm-page-order"
              trigger={
                <Button disabled={moved === 0} data-testid="apply-page-order">
                  אישור הסדר החדש
                </Button>
              }
              title="לשנות את סדר העמודים?"
              body={
                <>
                  <p className="mb-2">
                    {counted(moved, "עמוד אחד יקבל", "עמודים יקבלו")} מספר חדש.
                  </p>
                  <p>המודעות ששובצו זזות יחד עם העמוד שהן עליו.</p>
                </>
              }
              confirmLabel="כן, לשנות"
              pendingLabel="משנה…"
              onConfirm={async () => {
                const result = await onConfirm(order);
                if (!result?.message) onOpenChange(false);
                return result;
              }}
            />
            <Button
              variant="ghost"
              disabled={moved === 0}
              onClick={() => {
                setOrder(current);
                setTyped({});
              }}
            >
              חזרה לסדר הנוכחי
            </Button>
            <span className="text-xs text-on-surface-variant" data-testid="page-order-moved">
              {moves.length > 0 ? (
                <span className="me-2 inline-flex flex-wrap gap-1" data-testid="page-order-moves">
                  {moves.map((m) => (
                    <span
                      key={m.from}
                      className="inline-flex items-center gap-0.5 rounded-full bg-state-active/40 px-1.5 text-on-secondary-container"
                    >
                      <Ltr>{m.from}</Ltr>
                      <ArrowLeft className="size-3" aria-hidden />
                      <Ltr>{m.to}</Ltr>
                    </span>
                  ))}
                </span>
              ) : null}
              {moved === 0 ? "הסדר לא השתנה" : counted(moved, "עמוד אחד זז", "עמודים זזו")}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
