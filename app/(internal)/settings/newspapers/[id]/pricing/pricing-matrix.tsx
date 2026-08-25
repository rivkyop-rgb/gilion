"use client";

import { useState, useTransition } from "react";
import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";
import { upsertPriceRuleAction } from "../../../actions";

export type MatrixRow = {
  pageType: { id: string; name: string };
  cells: Array<{ shape: { id: string; name: string }; allowed: boolean; price: number | null }>;
};

/**
 * The price matrix: page types down, shapes across.
 *
 * A cell for a combination that is not in AllowedAdShape is disabled and
 * hatched — it is not merely empty, it is impossible, and the two must not look
 * the same. An empty *allowed* cell means "no default price", and the amount is
 * typed by hand on the order.
 */
export function PricingMatrix({
  newspaperId,
  rows,
  shapes,
  readOnly,
}: {
  newspaperId: string;
  rows: MatrixRow[];
  shapes: Array<{ id: string; name: string }>;
  readOnly: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  return (
    <>
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-sm" data-testid="pricing-matrix">
          <thead className="bg-surface-container">
            <tr>
              <th className="p-3 text-start font-semibold">סוג עמוד</th>
              {shapes.map((s) => (
                <th key={s.id} className="p-3 text-start font-semibold whitespace-nowrap">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.pageType.id} className="border-t border-outline-variant">
                <th scope="row" className="p-3 text-start font-medium">
                  {row.pageType.name}
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.shape.id}
                    data-testid={`cell-${row.pageType.id}-${cell.shape.id}`}
                    data-allowed={cell.allowed}
                    className={cn(
                      "p-2",
                      !cell.allowed &&
                        "bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,var(--color-surface-container)_5px,var(--color-surface-container)_10px)]",
                    )}
                  >
                    {cell.allowed ? (
                      <input
                        type="number"
                        dir="ltr"
                        min={0}
                        step="0.01"
                        readOnly={readOnly}
                        defaultValue={cell.price ?? ""}
                        placeholder="—"
                        aria-label={`מחיר ל${row.pageType.name}, ${cell.shape.name}`}
                        className="h-9 w-24 rounded-sm border border-outline-variant bg-surface-container px-2 text-start font-mono text-sm read-only:opacity-70"
                        onBlur={(e) => {
                          if (readOnly) return;
                          const value = e.target.value;
                          // Only save a value that actually changed. Blur also
                          // fires on the way out of the page, and firing a
                          // Server Action there aborts the navigation that
                          // caused it — the cell saved nothing and the click
                          // went nowhere.
                          if (value === String(cell.price ?? "")) return;
                          startTransition(async () => {
                            const res = await upsertPriceRuleAction(
                              newspaperId,
                              row.pageType.id,
                              cell.shape.id,
                              value,
                            );
                            setError(res.message ?? null);
                          });
                        }}
                      />
                    ) : (
                      <span
                        className="block text-center text-xs text-outline"
                        title="הצורה אינה מותרת בסוג העמוד הזה"
                      >
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-on-surface-variant">
        תא מקווקו = הצורה אינה מותרת בסוג העמוד הזה. תא ריק = אין מחיר בסיסי, והסכום יוקלד ידנית
        בהזמנה. סכומים ב־<Ltr>₪</Ltr>.
      </p>
    </>
  );
}
