"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { ShapePositionPicker } from "@/components/grid/shape-position-picker";
import {
  colsForWidthCm,
  footprintMm,
  formatCm,
  mmToCm,
  rowsForHeightCm,
  type DerivedGrid,
} from "@/lib/domain/grid";
import type { Cell } from "@/lib/domain/slot-geometry";
import { ShapePreview } from "../../../shape-preview";
import { createAdShapeAction, updateAdShapeAction, type FormState } from "../../../actions";
import type { CatalogShape } from "./shape-catalog";

/**
 * Create or edit one shape.
 *
 * Both dimensions are in CENTIMETRES — one unit, so there is nothing to
 * translate in your head. Each is snapped to the nearest whole column or row,
 * here for the live readout and again on the server, which never trusts these
 * numbers. The printed size is always on screen: a typed 12 cm width lands on
 * 12.9 cm because a column is 4.3 cm wide, and the form has to say so rather
 * than surprise anyone after saving.
 *
 * The allowed region is posted as JSON in a hidden field rather than as a
 * checkbox per cell: a 6x41 grid is 246 inputs, and the server needs the cells
 * as a set anyway.
 */
export function ShapeForm({
  newspaperId,
  grid,
  shape,
  onDone,
}: {
  newspaperId: string;
  grid: DerivedGrid;
  shape?: CatalogShape;
  onDone: () => void;
}) {
  const action = shape
    ? updateAdShapeAction.bind(null, newspaperId, shape.id)
    : createAdShapeAction.bind(null, newspaperId);

  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const start = shape ?? { cols: Math.min(3, grid.columns), rows: Math.min(10, grid.rows) };
  const startMm = footprintMm(start, grid);
  const [widthCm, setWidthCm] = useState(String(round1(mmToCm(startMm.widthMm))));
  const [heightCm, setHeightCm] = useState(String(round1(mmToCm(startMm.heightMm))));
  const [mode, setMode] = useState<"anywhere" | "region">(shape?.positionMode ?? "anywhere");
  const [cells, setCells] = useState<Cell[]>(shape?.allowedCells ?? []);

  // A successful action returns an empty state — but so does the initial one,
  // hence the `submitted` guard.
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!submitted || pending) return;
    if (!state.errors && !state.message) onDone();
    // onDone is an inline closure from the parent and would re-run this on
    // every render; the guards above are what actually decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, pending, submitted]);

  const err = (f: string) => state.errors?.[f];
  const footprint = {
    cols: colsForWidthCm(Number(widthCm), grid),
    rows: rowsForHeightCm(Number(heightCm), grid),
  };
  const actual = footprintMm(footprint, grid);
  // True when what will be saved differs from what was typed, to the tenth of a
  // centimetre the fields show.
  const snapped =
    round1(mmToCm(actual.widthMm)) !== round1(Number(widthCm)) ||
    round1(mmToCm(actual.heightMm)) !== round1(Number(heightCm));

  // `noValidate`: the server is the only boundary that knows the newspaper's
  // grid, so `max` below is a spinner hint only. A value past it must reach the
  // action and come back as our own Hebrew inline error, not as a browser
  // bubble that silently swallows the submit.
  return (
    <form
      action={formAction}
      onSubmit={() => setSubmitted(true)}
      noValidate
      data-testid="shape-form"
      className="rounded-lg border border-secondary bg-surface-container-lowest p-4"
    >
      <input type="hidden" name="positionMode" value={mode} />
      <input
        type="hidden"
        name="allowedCells"
        value={JSON.stringify(mode === "region" ? cells : [])}
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-4">
          <div>
            <Label htmlFor="shape-name">שם הצורה</Label>
            <Input
              id="shape-name"
              name="name"
              defaultValue={shape?.name ?? ""}
              placeholder="לדוגמה: מודעת חוצה עמוד"
              required
            />
            {err("name") ? <InlineError>{err("name")}</InlineError> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="shape-width-cm">רוחב בס״מ</Label>
              <Input
                id="shape-width-cm"
                name="widthCm"
                dir="ltr"
                type="number"
                step="0.1"
                min="0.1"
                value={widthCm}
                onChange={(e) => setWidthCm(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="shape-height-cm">גובה בס״מ</Label>
              <Input
                id="shape-height-cm"
                name="heightCm"
                dir="ltr"
                type="number"
                step="0.1"
                min="0.1"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                required
              />
            </div>
            {err("size") ? (
              <div className="sm:col-span-2">
                <InlineError>{err("size")}</InlineError>
              </div>
            ) : null}
          </div>

          {/* The number the user came for: what actually gets printed, after the
              typed size has been snapped to whole columns and rows. */}
          <div
            data-testid="shape-actual-size"
            className="rounded-sm bg-surface-container px-3 py-2 text-sm"
          >
            <p>
              בפועל: <Ltr>{`${formatCm(actual.widthMm)} × ${formatCm(actual.heightMm)} ס״מ`}</Ltr>
            </p>
            {snapped ? (
              <p className="mt-1 text-xs text-on-surface-variant">
                הגודל הותאם לחלוקת העמוד — העמוד מחולק ל־{grid.columns} עמודות ברוחב{" "}
                <Ltr>{`${formatCm(grid.columnWidthMm)} ס״מ`}</Ltr>, ומודעה תופסת מספר שלם מהן.
              </p>
            ) : null}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">איפה בעמוד מותר לצורה להופיע</legend>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="positionModeChoice"
                  data-testid="mode-anywhere"
                  checked={mode === "anywhere"}
                  onChange={() => setMode("anywhere")}
                />
                בכל מקום בעמוד
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="positionModeChoice"
                  data-testid="mode-region"
                  checked={mode === "region"}
                  onChange={() => setMode("region")}
                />
                רק במיקומים שאסמן ידנית
              </label>
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-on-surface-variant">תצוגה</span>
          <ShapePreview cols={footprint.cols} rows={footprint.rows} grid={grid} />
        </div>
      </div>

      {mode === "region" ? (
        <div className="mt-4 border-t border-outline-variant pt-4">
          <p className="mb-2 text-sm text-on-surface-variant">
            לחצי על העמוד כדי לקבוע איפה הצורה מותרת. מעבר עכבר מראה אותה בגודלה האמיתי במקום שבו
            תונח.
          </p>
          <ShapePositionPicker grid={grid} shape={footprint} value={cells} onChange={setCells} />
        </div>
      ) : null}

      {state.message ? <InlineError>{state.message}</InlineError> : null}

      <div className="mt-4 flex gap-2 border-t border-outline-variant pt-4">
        <Button type="submit" disabled={pending} data-testid="save-shape">
          {pending ? "שומרת…" : "שמירה"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          ביטול
        </Button>
      </div>
    </form>
  );
}

const round1 = (n: number) => Math.round(n * 10) / 10;
