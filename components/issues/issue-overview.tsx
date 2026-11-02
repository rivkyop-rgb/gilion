"use client";

import type { DerivedGrid } from "@/lib/domain/grid";
import type { PageFill } from "@/lib/domain/issue-layout";
import { pageLabel } from "@/lib/domain/issue-layout";
import type { ReservedArea } from "@/lib/domain/placement";
import { toCanvasPercent } from "@/lib/domain/slot-geometry";
import { fileHref } from "@/components/ads/ad-preview";
import { cn } from "@/lib/utils";
import type { CanvasPlacement } from "./page-canvas";

type OverviewView = { label: string; pages: Array<{ id: string; number: number }> };

const TONE_FILL = {
  ready: "border-status-success-fg",
  attention: "border-status-warning-fg",
  problem: "border-status-error-fg",
} as const;

/**
 * "כל הגיליון" — every spread at once, small (the user, 01/11/2026, from the
 * market survey: the flatplan view every magazine system leads with).
 *
 * A picture you act on, not a second editor: clicking a page with nothing in
 * hand opens it; clicking with an ad in hand puts the ad on that page in the
 * first place it fits, under the same rules as anywhere else.
 */
export function IssueOverview({
  views,
  grid,
  totalPages,
  placementsByPage,
  reservedByPage,
  fills,
  holding,
  refusesPage,
  onPageClick,
}: {
  views: OverviewView[];
  grid: DerivedGrid;
  totalPages: number;
  placementsByPage: Map<string, CanvasPlacement[]>;
  reservedByPage: Map<string, ReservedArea[]>;
  fills: Map<string, PageFill>;
  /** An ad is in hand: pages are drop targets. */
  holding: boolean;
  /** Pages whose type does not accept the held shape — dimmed, like on the board. */
  refusesPage: (pageId: string) => boolean;
  onPageClick: (pageId: string) => void;
}) {
  const ratio = grid.pageWidthMm / grid.pageHeightMm;
  return (
    <div
      data-testid="issue-overview"
      className="h-full overflow-y-auto p-2"
      aria-label="כל עמודי הגיליון"
    >
      {holding ? (
        <p className="mb-3 text-center text-xs text-on-surface-variant">
          לחיצה על עמוד תניח את המודעה במקום הראשון שנכנסת בו.
        </p>
      ) : null}
      <ul className="flex flex-wrap justify-center gap-x-6 gap-y-5" dir="rtl">
        {views.map((view) => (
          <li key={view.label} className="flex flex-col items-center gap-1">
            <div className="flex gap-0.5">
              {view.pages.map((page) => {
                const fill = fills.get(page.id);
                const refused = holding && refusesPage(page.id);
                return (
                  <button
                    key={page.id}
                    type="button"
                    data-testid={`overview-page-${page.number}`}
                    aria-label={`${pageLabel(page.number, totalPages)}${fill ? `, ${fill.full ? "מלא" : `${fill.percent}% מלא`}` : ""}`}
                    onClick={() => onPageClick(page.id)}
                    disabled={refused}
                    style={{ width: Math.round(210 * ratio), height: 210 }}
                    className={cn(
                      "relative overflow-hidden rounded-sm border border-outline bg-surface-container-lowest shadow-elevation-1 transition",
                      holding && !refused && "ring-2 ring-primary/40 hover:ring-primary",
                      !holding && "hover:ring-2 hover:ring-brand-gold",
                      refused && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {(reservedByPage.get(page.id) ?? []).map((area) => (
                      <Box
                        key={area.name}
                        rect={area.rect}
                        grid={grid}
                        className="border-dashed border-outline bg-surface-container"
                      >
                        {area.assetKey ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={fileHref(area.assetKey)}
                            alt=""
                            className="size-full object-contain"
                          />
                        ) : null}
                      </Box>
                    ))}
                    {(placementsByPage.get(page.id) ?? []).map((p) => (
                      <Box
                        key={p.id}
                        rect={p}
                        grid={grid}
                        className={cn("border-2", TONE_FILL[p.tone])}
                      >
                        {p.previewUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={fileHref(p.previewUrl)}
                            alt=""
                            className="size-full object-contain"
                          />
                        ) : (
                          <span className="block size-full bg-primary/10" />
                        )}
                      </Box>
                    ))}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-on-surface-variant">
              {view.label}
              {" · "}
              {view.pages
                .map((page) => {
                  const fill = fills.get(page.id);
                  return fill ? (fill.full ? "מלא" : `${fill.percent}%`) : "";
                })
                .filter(Boolean)
                .join(" / ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Box({
  rect,
  grid,
  className,
  children,
}: {
  rect: { col: number; row: number; cols: number; rows: number };
  grid: DerivedGrid;
  className?: string;
  children?: React.ReactNode;
}) {
  const pct = toCanvasPercent(rect, grid);
  return (
    <span
      aria-hidden
      style={{
        insetInlineStart: `${pct.startPct}%`,
        top: `${pct.topPct}%`,
        width: `${pct.widthPct}%`,
        height: `${pct.heightPct}%`,
      }}
      className={cn("pointer-events-none absolute overflow-hidden rounded-[1px] border", className)}
    >
      {children}
    </span>
  );
}
