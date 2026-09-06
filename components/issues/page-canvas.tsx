"use client";

import { useRef } from "react";

import type { DerivedGrid } from "@/lib/domain/grid";
import type { PageFill } from "@/lib/domain/issue-layout";
import { pageLabel } from "@/lib/domain/issue-layout";
import type { PlacementRejection, ReservedArea } from "@/lib/domain/placement";
import {
  cellAtPointer,
  toCanvasPercent,
  type Cell,
  type GridRect,
} from "@/lib/domain/slot-geometry";
import { fileHref } from "@/components/ads/ad-preview";
import { cn } from "@/lib/utils";

export type CanvasPage = {
  id: string;
  number: number;
  pageTypeName: string;
};

export type CanvasPlacement = {
  id: string;
  pageId: string;
  publicationId: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
  customerName: string;
  /**
   * The AD SHAPE this was placed as — not the placement's own id.
   *
   * Picking a placement up used to build a held shape whose `id` was the
   * PLACEMENT id, which matches nothing in a page type's allowed list. Every
   * rule that asks "is this shape allowed here" therefore answered no, on every
   * page, for every move. It hid in an advisory hover message for a long time
   * because the SERVER looks the real shape up and moving worked anyway —
   * until the same answer started dimming pages and stamping them refused.
   */
  shapeId: string;
  shapeName: string;
  /** The shape's allowed region, so a moved strip is still bottom-only. */
  shapePositions: Cell[] | null;
  previewUrl: string | null;
  duplicate: boolean;
  /** The file behind it, for the full-size preview the panel opens. */
  ad: {
    id: string;
    name: string;
    fileType: "pdf" | "jpg" | "png";
    fileSize: number;
    previewUrl: string | null;
    fileUrl: string | null;
  };
};

/**
 * One printed page, at its real proportions and at a size somebody chose.
 *
 * ── The size comes in as pixels, and that is the point ───────────────────────
 * A newspaper page is tall. Sized by the width available to it, it runs off the
 * bottom of any screen — and the more room you give the board, the taller it
 * gets, so collapsing the sidebar makes the problem WORSE. The only useful
 * question is "how much height is there", and the answer is computed once, by
 * the board, for the whole spread (see `useFittedSpread`).
 *
 * ── No left/right arithmetic ─────────────────────────────────────────────────
 * Cells are emitted in reading order inside a CSS grid under `dir="rtl"`, so
 * `col = 0` lands on the RIGHT with nothing computing a mirror. Ads position
 * with `insetInlineStart`, which resolves the same way, and the pointer becomes
 * a cell in exactly one place — `cellAtPointer` (lib/domain/slot-geometry.ts).
 *
 * ── Why the page draws its own artwork ───────────────────────────────────────
 * A rectangle with a customer's name on it tells a designer that something is
 * there. It does not tell them the ad is upside down, or that it is last
 * month's, or that two ads on facing pages are the same picture. The preview is
 * what makes the layout something you can actually check.
 */
export function PageCanvas({
  page,
  totalPages,
  grid,
  size,
  placements,
  reserved,
  fill,
  editable,
  holding,
  refusesHeld,
  candidate,
  verdict,
  selectedPlacementId,
  onCellEnter,
  onCellClick,
  onPointerCell,
  onDrop,
  onPlacementPick,
  onLeave,
}: {
  page: CanvasPage;
  totalPages: number;
  grid: DerivedGrid;
  /** Pixels. Computed by the board so the whole spread fits the screen. */
  size: { width: number; height: number };
  placements: CanvasPlacement[];
  /** Areas of this page that are not for sale (backlog item 14). */
  reserved: ReservedArea[];
  fill: PageFill;
  editable: boolean;
  /** Something is in hand, so the page is a drop target rather than a picture. */
  holding: boolean;
  /**
   * The held shape's name when THIS page type does not accept it, else null.
   *
   * Said before the click and not after. The refusal was correct — a back page
   * that sells only full and half pages is an ordinary newspaper rule — but it
   * arrived as an error message on a page that looked exactly like the two
   * beside it, so it read as the system being wrong (reported 06/09/2026).
   */
  refusesHeld: string | null;
  /** The rectangle being aimed at, when it is aimed at THIS page. */
  candidate: GridRect | null;
  verdict: PlacementRejection | null;
  selectedPlacementId: string | null;
  onCellEnter: (pageId: string, cell: Cell) => void;
  onCellClick: (pageId: string, cell: Cell) => void;
  onPointerCell: (pageId: string, cell: Cell) => void;
  onDrop: (pageId: string, cell: Cell) => void;
  onPlacementPick: (placement: CanvasPlacement) => void;
  onLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const cellFromPointer = (event: { clientX: number; clientY: number }): Cell | null => {
    const box = ref.current?.getBoundingClientRect();
    return box ? cellAtPointer(event, box, grid) : null;
  };

  return (
    <div className="flex min-w-0 flex-col gap-1" style={{ width: size.width }}>
      <div
        ref={ref}
        data-testid={`page-canvas-${page.number}`}
        dir="rtl"
        onPointerMove={(event) => {
          const cell = cellFromPointer(event);
          if (cell) onPointerCell(page.id, cell);
        }}
        onPointerUp={(event) => {
          const cell = cellFromPointer(event);
          if (cell) onDrop(page.id, cell);
        }}
        onPointerLeave={onLeave}
        style={{
          width: size.width,
          height: size.height,
          gridTemplateColumns: `repeat(${grid.columns}, 1fr)`,
          gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
        }}
        className={cn(
          "relative grid gap-px rounded-sm border border-outline bg-outline-variant p-px",
          // Dimmed, and the cursor says no before anything is clicked. Not
          // disabled: the page is still a page, and picking up an ad that IS
          // allowed here has to keep working.
          refusesHeld && "opacity-60 [&_button]:cursor-not-allowed",
        )}
      >
        {Array.from({ length: grid.rows }).flatMap((_, row) =>
          Array.from({ length: grid.columns }).map((__, col) => (
            <button
              key={`${col}-${row}`}
              type="button"
              disabled={!editable}
              data-testid={`board-cell-${page.number}-${col}-${row}`}
              aria-label={`${pageLabel(page.number, totalPages)}, עמודה ${col + 1} שורה ${row + 1}`}
              onPointerEnter={() => onCellEnter(page.id, [col, row])}
              onFocus={() => onCellEnter(page.id, [col, row])}
              onClick={() => onCellClick(page.id, [col, row])}
              className="bg-surface-dim"
            />
          )),
        )}

        {/* Reserved areas, under the ads and over the cells. Not buttons: there
            is nothing to do with one from here, and a button that answers a
            click with nothing is worse than a picture. `pointer-events-none`
            keeps the cell underneath reachable, so aiming at a reserved area
            still produces the sentence that says why it is refused. */}
        {reserved.map((area) => (
          <span
            key={area.name}
            data-testid={`reserved-${page.number}-${area.name}`}
            title={`${area.name} — שטח שמור, אינו נמכר`}
            style={rectStyle(area.rect, grid)}
            className="pointer-events-none absolute overflow-hidden rounded-[2px] border border-dashed border-outline bg-surface-container"
          >
            {area.assetKey ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={fileHref(area.assetKey)}
                alt={area.name}
                data-testid={`reserved-art-${page.number}`}
                className="size-full object-contain"
              />
            ) : (
              <span className="flex size-full items-center justify-center p-1 text-center text-[10px] leading-tight text-on-surface-variant">
                {area.name}
              </span>
            )}
          </span>
        ))}

        {placements.map((placement) => {
          const pct = toCanvasPercent(placement, grid);
          const selected = placement.id === selectedPlacementId;
          return (
            <button
              key={placement.id}
              type="button"
              /* The id deliberately does NOT start with "placement-": every
                 spec counts placements with [data-testid^="placement-"], and a
                 child sharing that prefix silently doubles the count. */
              data-testid={`placement-${placement.id}`}
              title={`${placement.customerName} · ${placement.shapeName}`}
              onPointerDown={(event) => {
                // Stops the page underneath reading this as a drop on the cell
                // the ad happens to be covering.
                event.stopPropagation();
                onPlacementPick(placement);
              }}
              style={{
                insetInlineStart: `${pct.startPct}%`,
                top: `${pct.topPct}%`,
                width: `${pct.widthPct}%`,
                height: `${pct.heightPct}%`,
              }}
              className={cn(
                "absolute overflow-hidden rounded-[2px] border bg-surface-container-lowest text-start",
                // While an ad is being held, a placed ad is a place to drop ONTO
                // — and to be refused for — not a button. Left clickable it
                // swallows the drop and the designer gets no answer at all.
                holding ? "pointer-events-none" : "",
                selected
                  ? "border-2 border-primary shadow-lg"
                  : placement.duplicate
                    ? "border-2 border-dashed border-status-accent-fg"
                    : "border-outline",
              )}
            >
              {placement.previewUrl ? (
                /* The artwork itself. `contain`, not `cover`: an ad cropped to
                   fill a box is exactly the thing a designer would fail to
                   notice was the wrong size. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={fileHref(placement.previewUrl)}
                  alt={placement.customerName}
                  data-testid={`ad-art-${placement.id}`}
                  className="size-full bg-surface-container-lowest object-contain"
                />
              ) : (
                /* Named, not blank. "No preview" is a fact about the FILE — a
                   PDF whose first page could not be rendered still prints — and
                   a silent grey box would read as a bug in the board. */
                <span
                  data-testid={`ad-nopreview-${placement.id}`}
                  className="flex size-full flex-col items-center justify-center gap-0.5 bg-surface-container p-1 text-center text-[10px] leading-tight text-on-surface-variant"
                >
                  <span>{placement.shapeName}</span>
                  <span className="opacity-70">אין תצוגה מקדימה</span>
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 truncate bg-primary/80 px-1 text-[10px] text-on-primary">
                {placement.customerName}
              </span>
            </button>
          );
        })}

        {/* The ghost: where the held ad would land, in the colour of the answer. */}
        {candidate ? (
          <span
            aria-hidden
            data-testid={`drop-ghost-${page.number}`}
            data-valid={verdict === null}
            style={rectStyle(candidate, grid)}
            className={cn(
              "pointer-events-none absolute rounded-[2px] border-2",
              verdict === null
                ? "border-status-success-fg bg-status-success-bg/60"
                : "border-dashed border-status-error-fg bg-status-error-bg/50",
            )}
          />
        ) : null}

        {/* The remainder a rejected drop would strand (rule 7א). */}
        {candidate && verdict?.rect ? (
          <span
            aria-hidden
            data-testid={`dead-space-hint-${page.number}`}
            style={rectStyle(verdict.rect, grid)}
            /* Red: this outline is part of a refusal, not a warning. */
            className="pointer-events-none absolute rounded-[2px] border-2 border-dotted border-status-error-fg"
          />
        ) : null}
      </div>

      <div className="flex items-baseline justify-between gap-2 px-1 text-xs text-on-surface-variant">
        <span className="truncate">
          {pageLabel(page.number, totalPages)} · {page.pageTypeName}
          {/* In the caption, which is reserved space under the page — never
              over it. A label drawn on the canvas would cover the rows being
              aimed at, which is the complaint that produced this. */}
          {refusesHeld ? (
            <span
              data-testid={`page-refuses-${page.number}`}
              className="ms-2 rounded-full bg-status-error-bg px-2 py-0.5 font-medium text-status-error-fg"
            >
              {refusesHeld} לא מותר בעמוד הזה
            </span>
          ) : null}
        </span>
        <span data-testid={`page-fill-${page.number}`} className="shrink-0">
          {fill.full ? "מלא" : `${fill.percent}%`}
        </span>
      </div>
    </div>
  );
}

function rectStyle(rect: GridRect, grid: DerivedGrid) {
  const pct = toCanvasPercent(rect, grid);
  return {
    insetInlineStart: `${pct.startPct}%`,
    top: `${pct.topPct}%`,
    width: `${pct.widthPct}%`,
    height: `${pct.heightPct}%`,
  };
}
