import { cn } from "@/lib/utils";

/**
 * An ad shape drawn as a proportional rectangle rather than a checkbox — the
 * one pattern from the Stitch mockups worth keeping (docs/design/gaps.md §ב).
 * Seeing the proportion is the whole point; a label alone does not convey it.
 *
 * The proportion is real: `cols`/`rows` against the newspaper's grid, not a
 * lookup table of invented figures. The footprint sits at the inline start,
 * which `dir="rtl"` puts on the right — the same corner `col = 0` means
 * everywhere else (lib/domain/slot-geometry.ts).
 */
export function ShapePreview({
  cols,
  rows,
  grid,
  selected = false,
  className,
}: {
  cols: number;
  rows: number;
  grid: { columns: number; rows: number };
  selected?: boolean;
  className?: string;
}) {
  const width = `${Math.min(100, (cols / grid.columns) * 100)}%`;
  const height = `${Math.min(100, (rows / grid.rows) * 100)}%`;

  return (
    <span
      aria-hidden
      className={cn(
        "flex h-12 w-9 items-start justify-start rounded-sm border bg-surface-container p-0.5",
        selected ? "border-secondary" : "border-outline-variant",
        className,
      )}
    >
      <span
        style={{ width, height }}
        className={cn("rounded-[2px]", selected ? "bg-state-active" : "bg-primary-container/70")}
      />
    </span>
  );
}
