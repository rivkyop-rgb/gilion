"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { InlineError, EmptyState } from "@/components/states";
import { formatCm, type DerivedGrid } from "@/lib/domain/grid";
import { validPositionCount, type Cell } from "@/lib/domain/slot-geometry";
import { ShapePreview } from "../../../shape-preview";
import { shapeSize } from "../../../shape-size";
import { deleteAdShapeAction } from "../../../actions";
import { ShapeForm } from "./shape-form";

export type CatalogShape = {
  id: string;
  name: string;
  cols: number;
  rows: number;
  positionMode: "anywhere" | "region";
  allowedCells: Cell[];
};

/**
 * The newspaper's shape catalogue — the set of options a page may be divided
 * into (US-006 AC-4).
 *
 * There is no pre-authored page layout anywhere in the system: a shape says how
 * big an ad is and where on the page it may sit, and the actual arrangement is
 * decided per page, per issue, from the ads that exist.
 */
export function ShapeCatalog({
  newspaperId,
  grid,
  shapes,
  readOnly,
}: {
  newspaperId: string;
  grid: DerivedGrid;
  shapes: CatalogShape[];
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">צורות פרסום</h2>
        <p className="font-mono text-xs text-on-surface-variant">
          <Ltr>{`העמוד מחולק ל־${grid.columns} עמודות ברוחב ${formatCm(grid.columnWidthMm)} ס״מ`}</Ltr>
        </p>
      </div>
      <p className="mb-4 text-sm text-on-surface-variant">
        אלה האפשרויות שאליהן אפשר לחלק עמוד בעיתון הזה. הגודל נמדד בס״מ ומותאם לחלוקת העמוד, ולכל
        צורה נקבע אם היא מותרת בכל מקום בעמוד או רק באזור מסוים. איפה בדיוק תשב כל מודעה נקבע בכל
        גיליון בנפרד, לפי הפרסומים שיש.
      </p>

      {error ? <InlineError>{error}</InlineError> : null}

      {shapes.length === 0 ? (
        <EmptyState
          title="אין עדיין צורות"
          body="בלי צורות אי אפשר לחלק עמוד. אפשר להוסיף את הראשונה כאן."
        />
      ) : null}

      <ul className="mb-4 space-y-3" data-testid="shape-list">
        {shapes.map((s) =>
          editing === s.id ? (
            <li key={s.id}>
              <ShapeForm
                newspaperId={newspaperId}
                grid={grid}
                shape={s}
                onDone={() => setEditing(null)}
              />
            </li>
          ) : (
            <li
              key={s.id}
              data-testid={`shape-row-${s.id}`}
              className="flex items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4"
            >
              <ShapePreview cols={s.cols} rows={s.rows} grid={grid} />

              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.name}</p>
                <p className="font-mono text-xs text-on-surface-variant">
                  <Ltr>{shapeSize(s, grid)}</Ltr>
                </p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {s.positionMode === "anywhere"
                    ? "מותרת בכל מקום בעמוד"
                    : `מותרת ב־${validPositionCount(s, s.allowedCells, grid)} מיקומים בעמוד`}
                </p>
              </div>

              {!readOnly ? (
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid={`edit-shape-${s.id}`}
                    onClick={() => setEditing(s.id)}
                  >
                    <Pencil className="size-4" />
                    עריכה
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    data-testid={`delete-shape-${s.id}`}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await deleteAdShapeAction(newspaperId, s.id);
                        setError(res.message ?? null);
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                    מחיקה
                  </Button>
                </div>
              ) : null}
            </li>
          ),
        )}
      </ul>

      {readOnly ? null : editing === "new" ? (
        <ShapeForm newspaperId={newspaperId} grid={grid} onDone={() => setEditing(null)} />
      ) : (
        <Button variant="secondary" data-testid="new-shape" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          צורה חדשה
        </Button>
      )}
    </section>
  );
}
