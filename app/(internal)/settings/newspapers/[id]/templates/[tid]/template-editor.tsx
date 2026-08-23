"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";
import type { Rect } from "@/lib/domain/slot-geometry";
import {
  addTemplatePageAction,
  deleteSlotAction,
  deleteTemplatePageAction,
  upsertSlotAction,
} from "../../../../actions";
import { PageCanvas, type CanvasSlot } from "./page-canvas";

export type EditorPage = {
  id: string;
  pageNumber: number;
  pageTypeId: string;
  pageTypeName: string;
  allowedShapeIds: string[];
  slots: CanvasSlot[];
};

export type EditorShape = { id: string; name: string; sizeGroup: string };

export function TemplateEditor({
  newspaperId,
  templateId,
  pages,
  shapes,
  pageTypes,
  aspectRatio,
  readOnly,
}: {
  newspaperId: string;
  templateId: string;
  pages: EditorPage[];
  shapes: EditorShape[];
  pageTypes: Array<{ id: string; name: string }>;
  aspectRatio: number;
  readOnly: boolean;
}) {
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const page = pages.find((p) => p.id === activePageId) ?? pages[0] ?? null;
  const allowedShapes = page ? shapes.filter((s) => page.allowedShapeIds.includes(s.id)) : [];
  const selected = page?.slots.find((s) => s.id === selectedSlotId) ?? null;

  const run = (fn: () => Promise<{ message?: string }>) =>
    startTransition(async () => setError((await fn()).message ?? null));

  function draw(rect: Rect) {
    if (!page) return;
    const shape = allowedShapes[0];
    if (!shape) {
      setError("אין צורות פרסום מותרות בסוג העמוד הזה — יש להגדיר אותן בלשונית סוגי העמודים");
      return;
    }
    run(() => upsertSlotAction(newspaperId, templateId, page.id, { adShapeId: shape.id, ...rect }));
  }

  function move(id: string, rect: Rect) {
    if (!page) return;
    const slot = page.slots.find((s) => s.id === id);
    if (!slot) return;
    const shapeId = shapes.find((s) => s.name === slot.shapeName)?.id ?? allowedShapes[0]?.id;
    if (!shapeId) return;
    run(() =>
      upsertSlotAction(newspaperId, templateId, page.id, { adShapeId: shapeId, ...rect }, id),
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr_260px]">
      {/* Right in RTL: the page strip */}
      <aside className="order-1">
        <h3 className="mb-2 text-sm font-semibold">עמודי התבנית</h3>
        <ul className="space-y-2" data-testid="page-strip">
          {pages.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-testid={`page-tab-${p.pageNumber}`}
                onClick={() => {
                  setActivePageId(p.id);
                  setSelectedSlotId(null);
                }}
                className={cn(
                  "w-full rounded-sm border p-2 text-start text-sm",
                  p.id === page?.id
                    ? "border-secondary bg-state-active text-on-secondary-container"
                    : "border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low",
                )}
              >
                <span className="block font-mono text-xs">
                  <Ltr>עמוד {p.pageNumber}</Ltr>
                </span>
                <span className="block">{p.pageTypeName}</span>
              </button>
            </li>
          ))}
        </ul>

        {!readOnly ? (
          <div className="mt-3 space-y-2">
            <label className="block text-xs text-on-surface-variant" htmlFor="add-page-type">
              הוספת עמוד
            </label>
            <select
              id="add-page-type"
              data-testid="add-page-select"
              disabled={busy}
              defaultValue=""
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                e.target.value = "";
                run(() => addTemplatePageAction(newspaperId, templateId, value));
              }}
              className="h-9 w-full rounded-sm border border-outline-variant bg-surface-container px-2 text-start text-sm"
            >
              <option value="">בחרי סוג עמוד…</option>
              {pageTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </select>
            {page ? (
              <Button
                variant="ghost"
                size="sm"
                block
                disabled={busy}
                data-testid="delete-page"
                onClick={() =>
                  run(() => deleteTemplatePageAction(newspaperId, templateId, page.id))
                }
              >
                <Trash2 className="size-4" />
                מחיקת העמוד הנוכחי
              </Button>
            ) : null}
          </div>
        ) : null}
      </aside>

      {/* Centre: the canvas */}
      <div className="order-2">
        {error ? <InlineError>{error}</InlineError> : null}
        {page ? (
          <>
            <p className="mb-2 text-xs text-on-surface-variant">
              {readOnly
                ? "תצוגה בלבד."
                : "גררי על שטח ריק כדי לצייר סלוט, או גררי סלוט קיים כדי להזיז אותו. ההצמדה היא לגריד של 5%."}
            </p>
            <PageCanvas
              aspectRatio={aspectRatio}
              slots={page.slots}
              selectedId={selectedSlotId}
              readOnly={readOnly || busy}
              onSelect={setSelectedSlotId}
              onDraw={draw}
              onMove={move}
            />
          </>
        ) : (
          <p className="rounded-lg border border-outline-variant bg-surface-container-lowest p-8 text-center text-sm text-on-surface-variant">
            אין עדיין עמודים בתבנית. הוסיפי עמוד מהרצועה כדי להתחיל.
          </p>
        )}
      </div>

      {/* Left in RTL: slot properties */}
      <aside className="order-3">
        <h3 className="mb-2 text-sm font-semibold">מאפייני הסלוט</h3>
        {selected && page ? (
          <div className="space-y-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
            <div>
              <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="slot-shape">
                צורת פרסום
              </label>
              <select
                id="slot-shape"
                data-testid="slot-shape"
                disabled={readOnly || busy}
                value={shapes.find((s) => s.name === selected.shapeName)?.id ?? ""}
                onChange={(e) =>
                  run(() =>
                    upsertSlotAction(
                      newspaperId,
                      templateId,
                      page.id,
                      {
                        adShapeId: e.target.value,
                        x: selected.x,
                        y: selected.y,
                        width: selected.width,
                        height: selected.height,
                      },
                      selected.id,
                    ),
                  )
                }
                className="h-9 w-full rounded-sm border border-outline-variant bg-surface-container px-2 text-start text-sm"
              >
                {/* Only shapes allowed on this page's page type (rule 8). */}
                {allowedShapes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs">
              {(
                [
                  ["מיקום אופקי", selected.x],
                  ["מיקום אנכי", selected.y],
                  ["רוחב", selected.width],
                  ["גובה", selected.height],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-on-surface-variant">{label}</dt>
                  <dd className="font-mono">
                    <Ltr>{value}%</Ltr>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-on-surface-variant">
              המידות נשמרות באחוזים מהעמוד, כך שהתבנית נשארת תקפה גם אם גודל העמוד ישתנה.
            </p>

            {!readOnly ? (
              <Button
                variant="destructive"
                size="sm"
                block
                disabled={busy}
                data-testid="delete-slot"
                onClick={() => {
                  setSelectedSlotId(null);
                  run(() => deleteSlotAction(newspaperId, templateId, selected.id));
                }}
              >
                <Trash2 className="size-4" />
                מחיקת הסלוט
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-outline-variant p-4 text-xs text-on-surface-variant">
            בחרי סלוט בקנבס כדי לראות ולשנות את המאפיינים שלו.
          </p>
        )}

        {page && allowedShapes.length === 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-sm bg-status-warning-bg p-3 text-xs text-status-warning-fg">
            <Plus className="size-4 shrink-0 rotate-45" />
            לסוג העמוד &quot;{page.pageTypeName}&quot; לא הוגדרו צורות פרסום מותרות, ולכן אי אפשר
            לצייר בו סלוטים.
          </p>
        ) : null}
      </aside>
    </div>
  );
}
