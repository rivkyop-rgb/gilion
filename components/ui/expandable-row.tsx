"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A table row with a small arrow that opens the rest of its details in a row
 * directly beneath it.
 *
 * The cells are rendered by the (server) page and handed in as children; this
 * only owns the open/closed state, so a list stays a server component and
 * nothing about its data moves to the client.
 *
 * The arrow and the details row are `expand-<row>` / `details-<row>`, NOT
 * `<row>-…`: specs count rows with `[data-testid^="publication-row-"]`, and a
 * child sharing the prefix doubles every count (CLAUDE.md).
 *
 * The arrow is the FIRST cell —
 * the start edge, which is the right in Hebrew — where the eye enters the row.
 */
export function ExpandableRow({
  children,
  details,
  colSpan,
  className,
  testId,
  rowProps,
}: {
  children: React.ReactNode;
  details: React.ReactNode;
  /** Every column, the arrow's included. */
  colSpan: number;
  className?: string;
  testId: string;
  rowProps?: Record<`data-${string}`, string>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr data-testid={testId} className={className} {...rowProps}>
        <td className="w-8 p-1 ps-2">
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "סגירת הפרטים" : "פתיחת הפרטים"}
            data-testid={`expand-${testId}`}
            onClick={() => setOpen((o) => !o)}
            className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
        </td>
        {children}
      </tr>
      {open ? (
        <tr data-testid={`details-${testId}`} className="bg-surface-container-low">
          <td colSpan={colSpan} className="px-4 py-3">
            {details}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** The label/value grid inside an opened row. */
export function DetailGrid({ items }: { items: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-on-surface-variant">{label}</dt>
          <dd className="mt-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
