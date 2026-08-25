"use client";

import { useState } from "react";
import type { DerivedGrid } from "@/lib/domain/grid";
import { footprintMm, formatCm } from "@/lib/domain/grid";
import { positionsFor, toCanvasPercent, type Cell } from "@/lib/domain/slot-geometry";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";

/**
 * Picks the positions on the page where a shape is allowed to sit (US-006 AC-4).
 *
 * ── Why you place the shape instead of painting an area ───────────────────────
 * The first version asked you to shade the cells the shape was allowed inside.
 * That put the footprint arithmetic on you: shade one row too few and the shape
 * silently becomes unplaceable, and nothing on screen ever showed you how big
 * the ad actually is. So the unit of interaction is the SHAPE, at its real
 * size: hover to see it sitting somewhere, click to say it may sit there.
 *
 * ── Why there is no left/right arithmetic here ────────────────────────────────
 * Positions are laid out in reading order — col 0 first — inside a plain CSS
 * grid, and `dir="rtl"` is what puts the first one on the RIGHT, which is
 * exactly what `col = 0` means (lib/domain/slot-geometry.ts). The one overlay
 * that is positioned by hand uses `insetInlineStart`, which resolves the same
 * way. Nothing computes a mirror, so nothing can compute it backwards.
 */
export function ShapePositionPicker({
  grid,
  shape,
  value,
  readOnly = false,
  onChange,
}: {
  grid: DerivedGrid;
  /** The footprint being placed — its real size is what the page shows. */
  shape: { cols: number; rows: number };
  value: Cell[];
  readOnly?: boolean;
  onChange: (positions: Cell[]) => void;
}) {
  const [hover, setHover] = useState<Cell | null>(null);
  // Which question a click answers. Marking the exceptions is far less work
  // when a shape is allowed almost everywhere — "anywhere except the cover
  // masthead" is two clicks in `forbid` and dozens in `allow`.
  const [mode, setMode] = useState<"allow" | "forbid">("allow");

  const key = (col: number, row: number) => `${col},${row}`;
  // Only positions where the shape actually fits exist at all; everywhere else
  // is rendered as blocked rather than offered and then refused.
  const available = positionsFor(shape, grid);
  const availableKeys = new Set(available.map(([c, r]) => key(c, r)));
  const chosen = new Set(
    value.filter(([c, r]) => availableKeys.has(key(c, r))).map(([c, r]) => key(c, r)),
  );

  const set = (next: Set<string>) => onChange(available.filter(([c, r]) => next.has(key(c, r))));

  const toggle = (col: number, row: number) => {
    const next = new Set(chosen);
    // Same stored value either way — only the meaning of a click flips. What is
    // saved is always the set of ALLOWED positions, so nothing downstream has
    // to know which way the person was thinking.
    if (mode === "allow") {
      if (next.has(key(col, row))) next.delete(key(col, row));
      else next.add(key(col, row));
    } else {
      if (next.has(key(col, row))) next.delete(key(col, row));
      else {
        // First exclusion on a blank board means "everywhere but here".
        if (next.size === 0) for (const [c, r] of available) next.add(key(c, r));
        next.delete(key(col, row));
      }
    }
    set(next);
  };

  const size = footprintMm(shape, grid);
  const label = `${formatCm(size.widthMm)} × ${formatCm(size.heightMm)} ס״מ`;

  /** The shape drawn at its real proportions, at one position. */
  const block = (cell: Cell, className: string, k?: string) => {
    const pct = toCanvasPercent({ col: cell[0], row: cell[1], ...shape }, grid);
    return (
      <span
        key={k}
        aria-hidden
        className={cn("pointer-events-none absolute rounded-[2px]", className)}
        style={{
          insetInlineStart: `${pct.startPct}%`,
          top: `${pct.topPct}%`,
          width: `${pct.widthPct}%`,
          height: `${pct.heightPct}%`,
        }}
      />
    );
  };

  return (
    <div>
      {!readOnly ? (
        <div className="mb-3 space-y-2">
          <div
            role="radiogroup"
            aria-label="מה לחיצה על העמוד עושה"
            className="inline-flex gap-1 rounded-md border border-outline-variant bg-surface-container p-1"
          >
            {(
              [
                ["allow", "מותר כאן", "bg-status-success-fg"],
                ["forbid", "אסור כאן", "bg-status-error-fg"],
              ] as const
            ).map(([m, text, dot]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                data-testid={`mode-${m}`}
                onClick={() => setMode(m)}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-surface-container-lowest text-on-surface shadow-sm ring-1 ring-outline-variant"
                    : "text-on-surface-variant hover:text-on-surface",
                )}
              >
                <span className={cn("size-2.5 rounded-full", dot)} aria-hidden />
                {text}
              </button>
            ))}
          </div>

          {/* What each colour on the page below means. Without this the grid is
              just coloured squares and the person has to guess. */}
          <div className="flex flex-wrap gap-4 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span
                className="size-3 rounded-[2px] border border-status-success-fg bg-status-success-bg"
                aria-hidden
              />
              מותר
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-3 rounded-[2px] border border-status-error-fg bg-status-error-bg"
                aria-hidden
              />
              אסור
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-[2px] bg-surface-dim opacity-60" aria-hidden />
              הצורה לא נכנסת כאן
            </span>
          </div>
        </div>
      ) : null}

      {!readOnly ? (
        <div className="mb-2 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(available)}
            data-testid="region-all"
          >
            כל מקום בעמוד
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(available.filter(([, r]) => r === 0))}
            data-testid="region-top"
          >
            צמוד לראש העמוד
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange(available.filter(([, r]) => r === grid.rows - shape.rows))}
            data-testid="region-bottom"
          >
            צמוד לתחתית העמוד
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onChange([])}
            data-testid="region-clear"
          >
            ניקוי
          </Button>
        </div>
      ) : null}

      <div
        data-testid="region-grid"
        onPointerLeave={() => setHover(null)}
        style={{
          gridTemplateColumns: `repeat(${grid.columns}, 1fr)`,
          gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
          aspectRatio: grid.pageWidthMm / grid.pageHeightMm,
        }}
        className={cn(
          "relative grid w-full max-w-xs gap-px rounded-sm border border-outline bg-outline-variant p-px",
          readOnly ? "cursor-default" : "cursor-pointer",
        )}
      >
        {Array.from({ length: grid.rows }).flatMap((_, row) =>
          Array.from({ length: grid.columns }).map((__, col) => {
            const fits = availableKeys.has(key(col, row));
            return (
              <button
                key={key(col, row)}
                type="button"
                disabled={readOnly || !fits}
                aria-pressed={chosen.has(key(col, row))}
                aria-label={
                  fits
                    ? `הנחת הצורה בעמודה ${col + 1} שורה ${row + 1}`
                    : `הצורה לא נכנסת בעמודה ${col + 1} שורה ${row + 1}`
                }
                data-testid={`cell-${col}-${row}`}
                data-fits={fits}
                onPointerEnter={() => (fits ? setHover([col, row]) : setHover(null))}
                onFocus={() => (fits ? setHover([col, row]) : undefined)}
                onClick={() => fits && !readOnly && toggle(col, row)}
                className={cn(
                  "min-h-2 rounded-[1px] transition-colors",
                  fits
                    ? "bg-surface-container-lowest"
                    : // Not "empty" — the shape cannot start here at all.
                      "bg-surface-dim opacity-60",
                )}
              />
            );
          }),
        )}

        {/* Drawn over the cells so the ad is visible at its real proportions
            rather than inferred from a shaded area. */}
        {available
          .filter(([c, r]) => chosen.has(key(c, r)))
          .map(([c, r]) =>
            block([c, r], "border border-status-success-fg bg-status-success-bg/80", key(c, r)),
          )}

        {/* In "forbid" mode the exclusions are the thing being edited, so they
            are drawn too — otherwise the page shows only what survived and you
            cannot see what you just took out. */}
        {mode === "forbid" && chosen.size > 0
          ? available
              .filter(([c, r]) => !chosen.has(key(c, r)))
              .map(([c, r]) =>
                block(
                  [c, r],
                  "border border-status-error-fg bg-status-error-bg/70",
                  `x-${key(c, r)}`,
                ),
              )
          : null}
        {hover && !readOnly
          ? block(
              hover,
              // The ghost shows the colour the position is about to become, so
              // the click is predictable before it happens.
              chosen.has(key(hover[0], hover[1]))
                ? "border-2 border-dashed border-status-error-fg bg-status-error-bg/50"
                : "border-2 border-dashed border-status-success-fg bg-status-success-bg/50",
            )
          : null}
      </div>

      <p
        data-testid="region-positions"
        className={cn(
          "mt-2 text-xs",
          chosen.size === 0 ? "text-status-error-fg" : "text-on-surface-variant",
        )}
      >
        {chosen.size === 0 ? (
          <>
            עדיין לא נבחר מיקום.{" "}
            {mode === "allow"
              ? "לחצי על העמוד כדי להניח שם מודעה של "
              : "לחצי על מקום שבו אסור להניח מודעה של "}
            <Ltr>{label}</Ltr>
            {mode === "forbid" ? " — כל השאר יהיה מותר." : "."}
          </>
        ) : (
          <>
            <Ltr>{`${chosen.size} מיקומים מותרים`}</Ltr> למודעה של <Ltr>{label}</Ltr>
            {chosen.size < available.length ? (
              <>
                {" "}
                — מתוך <Ltr>{available.length}</Ltr> אפשריים בעמוד.
              </>
            ) : (
              <> — כל מקום שבו היא נכנסת.</>
            )}
          </>
        )}
      </p>
    </div>
  );
}
