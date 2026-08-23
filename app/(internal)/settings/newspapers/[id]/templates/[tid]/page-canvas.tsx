"use client";

import { useRef, useState } from "react";
import { findOverlappingPairs, snap, validateRect, type Rect } from "@/lib/domain/slot-geometry";
import { cn } from "@/lib/utils";

export type CanvasSlot = Rect & { id: string; shapeName: string };

/**
 * The page canvas (FR-14).
 *
 * Drag on empty space to draw a slot; drag an existing slot to move it. All
 * geometry is percentages of the page, snapped to a 5% grid, so what the eye
 * sees and what the database stores are the same numbers.
 *
 * Overlaps are highlighted live — but the refusal that matters happens on the
 * server, in lib/data/templates.ts. This is feedback, not the boundary.
 */
export function PageCanvas({
  aspectRatio,
  slots,
  selectedId,
  readOnly,
  onSelect,
  onDraw,
  onMove,
}: {
  /** width / height of the real page, so the canvas matches the paper. */
  aspectRatio: number;
  slots: CanvasSlot[];
  selectedId: string | null;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  onDraw: (rect: Rect) => void;
  onMove: (id: string, rect: Rect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  // The drag mode lives in state, not only in the ref: render reads it to
  // decide what to paint, and reading a ref during render is not allowed.
  const [dragMode, setDragMode] = useState<"draw" | "move" | null>(null);
  const drag = useRef<
    | { mode: "draw"; startX: number; startY: number }
    | { mode: "move"; id: string; grabX: number; grabY: number; origin: Rect }
    | null
  >(null);

  const overlapping = new Set(
    findOverlappingPairs(slots).flatMap(([a, b]) => [slots[a]!.id, slots[b]!.id]),
  );

  /** Pointer position as a percentage of the canvas. */
  function pct(e: React.PointerEvent) {
    const box = ref.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - box.left) / box.width) * 100,
      y: ((e.clientY - box.top) / box.height) * 100,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (readOnly) return;
    const target = e.target as HTMLElement;
    const slotId = target.dataset["slotId"];
    const p = pct(e);
    ref.current?.setPointerCapture(e.pointerId);

    if (slotId) {
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return;
      onSelect(slotId);
      drag.current = { mode: "move", id: slotId, grabX: p.x, grabY: p.y, origin: slot };
      setDragMode("move");
    } else {
      onSelect(null);
      drag.current = { mode: "draw", startX: snap(p.x), startY: snap(p.y) };
      setDragMode("draw");
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const p = pct(e);

    if (drag.current.mode === "draw") {
      const { startX, startY } = drag.current;
      const x = Math.min(startX, snap(p.x));
      const y = Math.min(startY, snap(p.y));
      setDraft({
        x,
        y,
        width: Math.abs(snap(p.x) - startX),
        height: Math.abs(snap(p.y) - startY),
      });
    } else {
      const d = drag.current;
      const next: Rect = {
        x: snap(d.origin.x + (p.x - d.grabX)),
        y: snap(d.origin.y + (p.y - d.grabY)),
        width: d.origin.width,
        height: d.origin.height,
      };
      // Keep the slot on the page while dragging rather than letting it escape.
      next.x = Math.min(next.x, 100 - next.width);
      next.y = Math.min(next.y, 100 - next.height);
      setDraft(next);
    }
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    setDragMode(null);
    const rect = draft;
    setDraft(null);
    if (!d || !rect) return;

    if (validateRect(rect)) return; // too small or off-page: silently discard
    if (d.mode === "draw") onDraw(rect);
    else onMove(d.id, rect);
  }

  return (
    <div
      ref={ref}
      data-testid="page-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ aspectRatio }}
      className={cn(
        "relative w-full max-w-lg touch-none overflow-hidden rounded-sm border border-outline bg-surface-container-lowest",
        // A 5% grid, matching the snap step, so the drawing aid and the maths agree.
        "bg-[linear-gradient(to_right,var(--color-outline-variant)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-outline-variant)_1px,transparent_1px)] bg-[size:5%_5%]",
        readOnly ? "cursor-default" : "cursor-crosshair",
      )}
    >
      {slots.map((s) => {
        const isDragging = draft && selectedId === s.id && dragMode === "move";
        const box = isDragging ? draft : s;
        return (
          <div
            key={s.id}
            data-slot-id={s.id}
            data-testid={`slot-${s.id}`}
            style={{
              insetInlineStart: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.width}%`,
              height: `${box.height}%`,
            }}
            className={cn(
              "absolute flex items-center justify-center overflow-hidden rounded-sm border-2 border-dashed text-[10px] font-medium",
              overlapping.has(s.id)
                ? "border-error bg-status-error-bg text-status-error-fg"
                : selectedId === s.id
                  ? "border-secondary bg-state-active text-on-secondary-container"
                  : "border-primary-container bg-surface-container text-on-surface-variant",
            )}
          >
            <span data-slot-id={s.id} className="pointer-events-none px-1 text-center">
              {s.shapeName}
            </span>
          </div>
        );
      })}

      {draft && dragMode === "draw" ? (
        <div
          style={{
            insetInlineStart: `${draft.x}%`,
            top: `${draft.y}%`,
            width: `${draft.width}%`,
            height: `${draft.height}%`,
          }}
          className="absolute rounded-sm border-2 border-secondary bg-state-active/40"
        />
      ) : null}
    </div>
  );
}
