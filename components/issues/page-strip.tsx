"use client";

import { useState } from "react";
import { ArrowUpDown, Plus } from "lucide-react";

import type { IssueView, PageFill } from "@/lib/domain/issue-layout";
import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";

/**
 * The strip along the foot of the board: every view of the issue, in order.
 *
 * ── Two ways to place a page, because they answer different questions ────────
 * The seam between two views answers "put one HERE" in a single click, which is
 * what someone building an issue front-to-back wants and what stays usable on a
 * 24-page strip. Dragging answers "this one is in the wrong place", which is a
 * correction and is worth the pointer work. Building the first out of the
 * second — append, then drag it seven positions — is two actions for one
 * intention, and the expensive one is the drag.
 *
 * ── The fill bar is the point of the thumbnails ──────────────────────────────
 * A miniature of a page is barely legible at this size, so what it is really
 * carrying is the bar underneath it: how much of that page is sold. Scanning
 * for the empty ones is the single most common thing anyone does here.
 */
export function PageStrip({
  views,
  fills,
  activeIndex,
  editable,
  pageTypes,
  newPageTypeId,
  onNewPageTypeChange,
  onSelectView,
  onInsertAfter,
  onReorder,
  onOpenOrder,
}: {
  views: IssueView[];
  fills: Map<string, PageFill>;
  activeIndex: number;
  editable: boolean;
  pageTypes: Array<{ id: string; name: string }>;
  newPageTypeId: string;
  onNewPageTypeChange: (id: string) => void;
  onSelectView: (index: number) => void;
  onInsertAfter: (pageId: string) => void;
  /** A drag is a PROPOSAL: it opens the ordering dialog, which confirms it. */
  onReorder: (orderedPageIds: string[]) => void;
  onOpenOrder: () => void;
}) {
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [overPageId, setOverPageId] = useState<string | null>(null);

  const orderedPageIds = views.flatMap((v) => v.pages.map((p) => p.id));

  /** Moves the dragged page to where the one it was dropped on sits now. */
  const drop = (targetPageId: string) => {
    if (!draggingPageId || draggingPageId === targetPageId) {
      setDraggingPageId(null);
      setOverPageId(null);
      return;
    }
    const without = orderedPageIds.filter((id) => id !== draggingPageId);
    const at = without.indexOf(targetPageId);
    without.splice(at, 0, draggingPageId);
    setDraggingPageId(null);
    setOverPageId(null);
    onReorder(without);
  };

  return (
    <div className="mt-3 overflow-x-auto pb-2" data-testid="page-strip">
      <ul className="flex items-stretch gap-1">
        {views.map((view, index) => (
          <li key={view.index} className="flex items-stretch gap-1">
            <button
              type="button"
              data-testid={`view-tab-${index}`}
              aria-current={index === activeIndex}
              onClick={() => onSelectView(index)}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-2 text-xs transition-colors",
                index === activeIndex
                  ? "border-primary bg-status-accent-bg font-medium"
                  : "border-outline-variant hover:bg-surface-container",
              )}
            >
              <span className="whitespace-nowrap">{view.label}</span>

              <span className="flex gap-1">
                {view.pages.map((page) => {
                  const fill = fills.get(page.id);
                  return (
                    <span
                      key={page.id}
                      data-testid={`page-thumb-${page.number}`}
                      data-dragging={draggingPageId === page.id}
                      draggable={editable}
                      onDragStart={() => setDraggingPageId(page.id)}
                      onDragEnd={() => {
                        setDraggingPageId(null);
                        setOverPageId(null);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setOverPageId(page.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        drop(page.id);
                      }}
                      title={`עמוד ${page.number} · ${page.pageTypeName}`}
                      className={cn(
                        "flex w-8 flex-col justify-end gap-0.5 rounded-[3px] border bg-surface-container-lowest p-0.5",
                        editable ? "cursor-grab" : "",
                        draggingPageId === page.id ? "opacity-40" : "",
                        overPageId === page.id && draggingPageId && draggingPageId !== page.id
                          ? "border-primary ring-2 ring-primary"
                          : "border-outline-variant",
                      )}
                    >
                      <span className="text-center text-[10px] leading-none text-on-surface-variant">
                        <Ltr>{page.number}</Ltr>
                      </span>
                      <span
                        className="h-1 w-full overflow-hidden rounded-full bg-surface-container"
                        aria-hidden
                      >
                        <span
                          className={cn(
                            "block h-full",
                            fill?.full ? "bg-status-success-fg" : "bg-primary",
                          )}
                          style={{ inlineSize: `${fill?.percent ?? 0}%` }}
                        />
                      </span>
                    </span>
                  );
                })}
              </span>
            </button>

            {/* The seam: a new page lands directly after the last page of this
                view. Never offered after the back page — the back stays last. */}
            {editable && index < views.length - 1 ? (
              <button
                type="button"
                data-testid={`seam-${view.pages[view.pages.length - 1]!.number}`}
                aria-label={`הוספת עמוד אחרי עמוד ${view.pages[view.pages.length - 1]!.number}`}
                title={`הוספת עמוד אחרי עמוד ${view.pages[view.pages.length - 1]!.number}`}
                onClick={() => onInsertAfter(view.pages[view.pages.length - 1]!.id)}
                className="flex w-6 shrink-0 items-center justify-center rounded-lg border border-dashed border-outline-variant text-on-surface-variant transition-colors hover:border-primary hover:bg-status-accent-bg hover:text-primary"
              >
                <Plus className="size-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {editable && pageTypes.length > 0 ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-on-surface-variant">
          <label htmlFor="new-page-type">עמוד חדש יהיה מסוג</label>
          <select
            id="new-page-type"
            data-testid="new-page-type"
            value={newPageTypeId}
            onChange={(e) => onNewPageTypeChange(e.target.value)}
            className="h-8 rounded-lg border border-outline-variant bg-surface-container-lowest px-2 text-sm"
          >
            {pageTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="open-page-order"
            onClick={onOpenOrder}
            className="ms-auto inline-flex items-center gap-1 rounded-lg border border-outline-variant px-2 py-1 font-medium text-on-surface hover:bg-surface-container"
          >
            <ArrowUpDown className="size-3.5" aria-hidden />
            שינוי סדר העמודים
          </button>
        </div>
      ) : null}
    </div>
  );
}
