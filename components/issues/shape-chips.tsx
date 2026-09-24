"use client";

import type { DerivedGrid } from "@/lib/domain/grid";
import { sizeLabel, type ShapeSpec } from "@/lib/domain/placement";
import { cn } from "@/lib/utils";

/**
 * What may still be sold onto a page, drawn rather than listed.
 *
 * ── Why a picture and not a line of text ─────────────────────────────────────
 * "רבע עמוד · 13.0 × 21.0 ס״מ" asks the reader to hold a page in their head and
 * work out what a quarter of it looks like. Everyone doing that job already has
 * the page on screen next to the list, and the one thing the list was not
 * telling them is the thing the page makes obvious in a glance: the SHAPE. A
 * half page across and a half page down are the same two words and the same
 * area, and they are not remotely the same offer to a customer.
 *
 * So each shape is drawn as the footprint it really is, on a miniature of the
 * real page, at the real proportion. The name and the centimetres stay — a
 * seller quotes them out loud — but they are no longer doing the explaining.
 *
 * ── Dimmed, not struck through ───────────────────────────────────────────────
 * A shape that no longer fits is still a shape this page SELLS; it is out of
 * room today and will not be tomorrow, once something moves. A strike-through
 * reads as "withdrawn" and sends people to the settings screen to look for a
 * change nobody made.
 */
export function ShapeChips({
  shapes,
  fits,
  grid,
  emptyMessage = "סוג העמוד הזה לא מתיר אף צורה.",
  testId,
}: {
  shapes: readonly ShapeSpec[];
  /** Ids that still have somewhere to go on this page right now. */
  fits: ReadonlySet<string>;
  grid: DerivedGrid;
  emptyMessage?: string;
  testId?: string;
}) {
  if (shapes.length === 0) {
    return <p className="text-xs text-on-surface-variant">{emptyMessage}</p>;
  }

  return (
    <ul className="mt-1 flex flex-wrap gap-1.5" data-testid={testId}>
      {shapes.map((shape) => {
        const usable = fits.has(shape.id);
        return (
          <li
            key={shape.id}
            data-shape={shape.id}
            data-fits={usable}
            title={`${shape.name} · ${sizeLabel(shape, grid)}${usable ? "" : " · אין מקום פנוי כרגע"}`}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-1.5 py-1",
              usable
                ? "border-outline-variant bg-surface-container-lowest"
                : "border-outline-variant/60 bg-surface-container opacity-45",
            )}
          >
            <ShapeGlyph shape={shape} grid={grid} usable={usable} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-xs font-medium">{shape.name}</span>
              <span className="block truncate text-[10px] text-on-surface-variant">
                {sizeLabel(shape, grid)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The shape, on a miniature of the page, at the real proportion.
 *
 * Drawn where it is ALLOWED to sit when the shape is region-constrained — a
 * bottom strip shown floating in the middle of the page would be a lie about
 * the one thing that makes it different from every other strip.
 */
function ShapeGlyph({
  shape,
  grid,
  usable,
}: {
  shape: ShapeSpec;
  grid: DerivedGrid;
  usable: boolean;
}) {
  const widthPct = (shape.cols / Math.max(1, grid.columns)) * 100;
  const heightPct = (shape.rows / Math.max(1, grid.rows)) * 100;

  // The first allowed position, or the top-start corner when it may sit
  // anywhere. `col` grows leftward under RTL, and `insetInlineStart` resolves
  // the same way — so no mirroring here either (slot-geometry.ts).
  const [col, row] = shape.positions?.[0] ?? [0, 0];

  return (
    <span
      aria-hidden
      style={{ aspectRatio: grid.pageWidthMm / grid.pageHeightMm }}
      className={cn(
        "relative block h-8 shrink-0 rounded-[2px] border",
        usable ? "border-outline bg-surface-dim" : "border-outline-variant bg-surface-dim/60",
      )}
    >
      <span
        className={cn("absolute rounded-[1px]", usable ? "bg-primary" : "bg-outline")}
        style={{
          insetInlineStart: `${(col / Math.max(1, grid.columns)) * 100}%`,
          top: `${(row / Math.max(1, grid.rows)) * 100}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
        }}
      />
    </span>
  );
}
