"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/states";
import { ReservedAreas, type ReservedAreaRow } from "./reserved-areas";
import { ShapePreview } from "../../shape-preview";
import { shapeSize } from "../../shape-size";
import type { DerivedGrid } from "@/lib/domain/grid";
import {
  createPageTypeAction,
  deletePageTypeAction,
  setAllowedShapesAction,
  type FormState,
} from "../../actions";

export type ShapeOption = { id: string; name: string; cols: number; rows: number };
export type PageTypeRow = {
  id: string;
  name: string;
  allowedShapeIds: string[];
  /** The parts of this page that are not for sale (backlog item 14). */
  reserved: ReservedAreaRow[];
};

/**
 * Page types, each expanding to its allowed shapes.
 *
 * Shapes are shown as proportional rectangles rather than checkboxes — the one
 * pattern worth keeping from the Stitch mockups (design/gaps.md §ב): the
 * proportion is the information, and a checkbox hides it.
 */
export function PageTypes({
  newspaperId,
  pageTypes,
  shapes,
  grid,
  readOnly,
}: {
  newspaperId: string;
  pageTypes: PageTypeRow[];
  shapes: ShapeOption[];
  /** The newspaper's grid — what makes each shape's proportion and size real. */
  grid: DerivedGrid;
  readOnly: boolean;
}) {
  const bound = createPageTypeAction.bind(null, newspaperId);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, {});
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  return (
    <section>
      <h2 className="mb-1 font-serif text-xl font-semibold">סוגי עמודים</h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        לכל סוג עמוד נקבע אילו צורות פרסום מותרות בו. זה מה שיגביל את השיבוץ בהמשך.
      </p>

      {error ? <InlineError>{error}</InlineError> : null}

      <ul className="mb-4 space-y-3">
        {pageTypes.map((pt) => (
          <li
            key={pt.id}
            className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4"
            data-testid={`page-type-${pt.id}`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="font-semibold">{pt.name}</span>
              {!readOnly ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  data-testid={`delete-page-type-${pt.id}`}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await deletePageTypeAction(newspaperId, pt.id);
                      setError(res.message ?? null);
                    })
                  }
                >
                  <Trash2 className="size-4" />
                  מחיקה
                </Button>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              {shapes.map((s) => {
                const selected = pt.allowedShapeIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={readOnly || busy}
                    aria-pressed={selected}
                    data-testid={`shape-${pt.id}-${s.id}`}
                    title={`${s.name} — ${shapeSize(s, grid)}`}
                    onClick={() =>
                      startTransition(async () => {
                        const next = selected
                          ? pt.allowedShapeIds.filter((x) => x !== s.id)
                          : [...pt.allowedShapeIds, s.id];
                        const res = await setAllowedShapesAction(newspaperId, pt.id, next);
                        setError(res.message ?? null);
                      })
                    }
                    className="flex flex-col items-center gap-1 disabled:opacity-60"
                  >
                    <ShapePreview cols={s.cols} rows={s.rows} grid={grid} selected={selected} />
                    <span className="max-w-16 text-center text-[10px] leading-tight text-on-surface-variant">
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <ReservedAreas
              newspaperId={newspaperId}
              pageTypeId={pt.id}
              grid={grid}
              areas={pt.reserved}
              readOnly={readOnly}
            />
          </li>
        ))}
      </ul>

      {!readOnly ? (
        <form action={action} className="flex items-start gap-2">
          <div className="flex-1">
            <Input
              name="name"
              placeholder="שם סוג עמוד חדש — למשל: מרכזי"
              data-testid="page-type-name"
            />
            {state.errors?.name ? <InlineError>{state.errors.name}</InlineError> : null}
          </div>
          <Button type="submit" variant="secondary" disabled={pending} data-testid="add-page-type">
            <Plus className="size-4" />
            הוספה
          </Button>
        </form>
      ) : null}
    </section>
  );
}
