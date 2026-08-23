import { cn } from "@/lib/utils";

/**
 * Ad shapes drawn as proportional rectangles rather than checkboxes — the one
 * pattern from the Stitch mockups worth keeping (docs/design/gaps.md §ב).
 * Seeing the proportion is the whole point; a label alone does not convey it.
 */
const PROPORTIONS: Record<string, { w: string; h: string }> = {
  full: { w: "100%", h: "100%" },
  half: { w: "100%", h: "50%" },
  quarter: { w: "50%", h: "50%" },
  eighth: { w: "50%", h: "25%" },
  strip: { w: "100%", h: "18%" },
  other: { w: "60%", h: "40%" },
};

export function ShapePreview({
  sizeGroup,
  selected = false,
  className,
}: {
  sizeGroup: string;
  selected?: boolean;
  className?: string;
}) {
  const p = PROPORTIONS[sizeGroup] ?? PROPORTIONS.other!;
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-12 w-9 items-end justify-center rounded-sm border bg-surface-container p-0.5",
        selected ? "border-secondary" : "border-outline-variant",
        className,
      )}
    >
      <span
        style={{ width: p.w, height: p.h }}
        className={cn("rounded-[2px]", selected ? "bg-state-active" : "bg-primary-container/70")}
      />
    </span>
  );
}
