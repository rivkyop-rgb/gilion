"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";
import { upsertPriceRuleAction } from "../../../actions";

export type MatrixRow = {
  pageType: { id: string; name: string };
  cells: Array<{ shape: { id: string; name: string }; allowed: boolean; price: number | null }>;
};

type CellKey = string;
const keyOf = (pageTypeId: string, shapeId: string): CellKey => `${pageTypeId}:${shapeId}`;

/**
 * The price matrix: page types down, shapes across.
 *
 * A cell for a combination that is not in AllowedAdShape is disabled and
 * hatched — it is not merely empty, it is impossible, and the two must not look
 * the same. An empty *allowed* cell means "no default price", and the amount is
 * typed by hand on the order.
 *
 * SAVING IS EXPLICIT. It used to happen on blur, which worked and told nobody:
 * you typed a price, clicked away, and the screen looked exactly as it had
 * before whether the write had succeeded, failed, or never fired. A price list
 * is the kind of thing a person wants to be *sure* about, so the edits are held
 * until a button is pressed, the button says how many are pending, and the
 * screen says so afterwards.
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
  const [saved, setSaved] = useState<number | null>(null);
  const [dirty, setDirty] = useState<Map<CellKey, string>>(new Map());
  const [busy, startTransition] = useTransition();

  /**
   * What each cell held the last time it was SAVED — not what the props say.
   *
   * The two diverge the moment someone saves twice in one visit: the props
   * only change when the route revalidates, so a baseline read from them keeps
   * comparing against the value the page loaded with. Clearing a cell that was
   * just set to 900 then reads as "back to how it was", the change is not
   * counted, and the save button stays disabled with no way to explain itself.
   */
  const [baseline, setBaseline] = useState<Map<CellKey, string>>(() => {
    const map = new Map<CellKey, string>();
    for (const row of rows) {
      for (const cell of row.cells) {
        map.set(keyOf(row.pageType.id, cell.shape.id), String(cell.price ?? ""));
      }
    }
    return map;
  });

  const edit = (pageTypeId: string, shapeId: string, value: string) => {
    const key = keyOf(pageTypeId, shapeId);
    setSaved(null);
    setDirty((prev) => {
      const next = new Map(prev);
      // Typing a value back to what it was is not a change — the counter has
      // to fall as well as rise, or it stops meaning anything.
      if (value === (baseline.get(key) ?? "")) next.delete(key);
      else next.set(key, value);
      return next;
    });
  };

  const save = () =>
    startTransition(async () => {
      setError(null);
      const entries = [...dirty.entries()];
      for (const [key, value] of entries) {
        const [pageTypeId, shapeId] = key.split(":");
        const res = await upsertPriceRuleAction(newspaperId, pageTypeId!, shapeId!, value);
        if (res.message) {
          setError(res.message);
          return;
        }
      }
      // What was just written becomes the new baseline, so the next edit of
      // the same cell is measured against reality.
      setBaseline((prev) => new Map([...prev, ...entries]));
      setSaved(entries.length);
      setDirty(new Map());
    });

  return (
    <>
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
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
                {row.cells.map((cell) => {
                  const key = keyOf(row.pageType.id, cell.shape.id);
                  const changed = dirty.has(key);
                  return (
                    <td
                      key={cell.shape.id}
                      data-testid={`cell-${row.pageType.id}-${cell.shape.id}`}
                      data-allowed={cell.allowed}
                      data-dirty={changed}
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
                          className={cn(
                            "h-9 w-24 rounded-sm border bg-surface-container px-2 text-start font-mono text-sm read-only:opacity-70",
                            changed
                              ? "border-primary ring-1 ring-primary"
                              : "border-outline-variant",
                          )}
                          onChange={(e) => {
                            if (readOnly) return;
                            edit(row.pageType.id, cell.shape.id, e.target.value);
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
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button disabled={busy || dirty.size === 0} data-testid="save-pricing" onClick={save}>
            <Save className="size-4" />
            {busy ? "שומרת…" : dirty.size === 0 ? "שמירה" : `שמירה (${dirty.size} שינויים)`}
          </Button>

          {dirty.size > 0 ? (
            <span data-testid="pricing-dirty" className="text-sm text-status-warning-fg">
              יש שינויים שלא נשמרו
            </span>
          ) : null}

          {saved !== null ? (
            <span
              role="status"
              data-testid="pricing-saved"
              className="text-sm text-status-success-fg"
            >
              נשמרו {saved} מחירים
            </span>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-xs text-on-surface-variant">
        תא מקווקו = הצורה אינה מותרת בסוג העמוד הזה. תא ריק = אין מחיר בסיסי, והסכום יוקלד ידנית
        בהזמנה. סכומים ב־<Ltr>₪</Ltr>.
      </p>
    </>
  );
}
