"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormActionState } from "@/components/use-form-action-state";
import { ImageOff, Plus, Trash2 } from "lucide-react";

import type { DerivedGrid } from "@/lib/domain/grid";
import { toCanvasPercent, type Cell, type GridRect } from "@/lib/domain/slot-geometry";
import { RESERVATION_ACCEPT_ATTRIBUTE, reservedShare, shortSize } from "@/lib/domain/reservation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { fileHref } from "@/components/ads/ad-preview";
import { cn } from "@/lib/utils";
import {
  clearReservationAssetAction,
  deleteReservationAction,
  saveReservationAction,
  type FormState,
} from "../../actions";

export type ReservedAreaRow = {
  id: string;
  name: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
  assetKey: string | null;
};

/**
 * The part of a page the newspaper keeps for itself (backlog item 14).
 *
 * ── Why it is drawn and not typed ────────────────────────────────────────────
 * The four numbers behind an area are column, row, width and height in grid
 * units — a coordinate system nobody is fluent in, on a page they have never
 * seen as a grid. Two clicks on a picture of the page say the same thing and
 * can be checked by looking. The centimetres are shown alongside, because that
 * is the unit the masthead was designed in.
 *
 * ── Why the areas of a page type live under the page type ────────────────────
 * "The cover always looks like this" is a fact about covers, not about any one
 * issue. Defined once here, copied into every issue opened afterwards, and — by
 * being copied — left alone in every issue already laid out.
 */
export function ReservedAreas({
  newspaperId,
  pageTypeId,
  grid,
  areas,
  readOnly,
}: {
  newspaperId: string;
  pageTypeId: string;
  /** The newspaper's live grid — what makes a rectangle a size in centimetres. */
  grid: DerivedGrid;
  areas: ReservedAreaRow[];
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState<ReservedAreaRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // What the last save did — including which open issues it reached.
  const [note, setNote] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const share = reservedShare(areas, grid);

  const run = (action: () => Promise<FormState>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.message && result.errors ? result.message : null);
      if (result.errors) setError(Object.values(result.errors)[0] ?? null);
      setNote(result.errors ? null : (result.message ?? null));
    });

  return (
    <div className="mt-4 border-t border-outline-variant pt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">אזורים שמורים</h4>
        <p className="text-xs text-on-surface-variant">
          {areas.length === 0 ? (
            "שטח שאינו נמכר — כותרת העיתון, לוגו קבוע. מה שנקבע כאן נכנס לכל גיליון שייפתח מעכשיו, וגם לגיליונות שעדיין פתוחים."
          ) : (
            <>
              <Ltr>{share}%</Ltr> מהעמוד שמור ואינו נמכר
            </>
          )}
        </p>
      </div>

      {error ? <InlineError>{error}</InlineError> : null}
      {note ? (
        <p
          role="status"
          data-testid="reserved-note"
          className="mb-2 text-xs text-status-success-fg"
        >
          {note}
        </p>
      ) : null}

      {areas.length > 0 ? (
        <ul className="mb-3 space-y-2" data-testid={`reserved-list-${pageTypeId}`}>
          {areas.map((area) => (
            <li
              key={area.id}
              data-testid={`reserved-row-${area.id}`}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-2"
            >
              <span className="size-10 shrink-0 overflow-hidden rounded border border-outline-variant bg-surface-container">
                {area.assetKey ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={fileHref(area.assetKey)}
                    alt={area.name}
                    data-testid={`reserved-thumb-${area.id}`}
                    className="size-full object-contain"
                  />
                ) : (
                  <ImageOff className="m-auto mt-2.5 size-5 text-on-surface-variant" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{area.name}</span>
                <span className="block text-xs text-on-surface-variant">
                  <Ltr>{shortSize(area, grid)}</Ltr> ס״מ
                </span>
              </span>

              {readOnly ? null : (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(area)}>
                    עריכה
                  </Button>
                  {area.assetKey ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      data-testid={`reserved-clear-${area.id}`}
                      onClick={() => run(() => clearReservationAssetAction(newspaperId, area.id))}
                    >
                      הסרת התמונה
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={`מחיקת ${area.name}`}
                    data-testid={`reserved-delete-${area.id}`}
                    onClick={() => run(() => deleteReservationAction(newspaperId, area.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {readOnly ? null : editing ? (
        <ReservedAreaForm
          key={editing === "new" ? "new" : editing.id}
          newspaperId={newspaperId}
          pageTypeId={pageTypeId}
          grid={grid}
          area={editing === "new" ? null : editing}
          others={areas.filter((a) => editing === "new" || a.id !== editing.id)}
          onDone={(message) => {
            setEditing(null);
            setNote(message ?? null);
          }}
        />
      ) : (
        <Button
          size="sm"
          variant="secondary"
          data-testid={`reserved-add-${pageTypeId}`}
          onClick={() => setEditing("new")}
        >
          <Plus className="size-4" />
          אזור שמור
        </Button>
      )}
    </div>
  );
}

function ReservedAreaForm({
  newspaperId,
  pageTypeId,
  grid,
  area,
  others,
  onDone,
}: {
  newspaperId: string;
  pageTypeId: string;
  grid: DerivedGrid;
  area: ReservedAreaRow | null;
  others: ReservedAreaRow[];
  onDone: (message?: string) => void;
}) {
  const bound = saveReservationAction.bind(null, newspaperId, pageTypeId);
  const [state, action, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    async (prev, data) => {
      const result = await bound(prev, data);
      if (!result.errors) onDone(result.message);
      return result;
    },
    {},
  );

  const [rect, setRect] = useState<GridRect | null>(
    area ? { col: area.col, row: area.row, cols: area.cols, rows: area.rows } : null,
  );
  const [name, setName] = useState(area?.name ?? "");
  // The picked file, shown inside the area before anything is saved — the
  // user sees the logo where and how big it will print (03/11/2026).
  const [pickedUrl, setPickedUrl] = useState<string | null>(null);
  useEffect(() => () => (pickedUrl ? URL.revokeObjectURL(pickedUrl) : undefined), [pickedUrl]);
  const imageSrc = pickedUrl ?? (area?.assetKey ? fileHref(area.assetKey) : null);

  return (
    <form
      action={action}
      onReset={keepTypedOnError}
      className="rounded-lg border border-outline-variant p-3"
    >
      {area ? <input type="hidden" name="id" value={area.id} /> : null}
      <input type="hidden" name="col" value={rect?.col ?? ""} />
      <input type="hidden" name="row" value={rect?.row ?? ""} />
      <input type="hidden" name="cols" value={rect?.cols ?? ""} />
      <input type="hidden" name="rows" value={rect?.rows ?? ""} />

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">שם האזור</span>
          <Input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="כותרת העיתון"
            data-testid="reserved-name"
            required
          />
          {state.errors?.name ? <InlineError>{state.errors.name}</InlineError> : null}
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            תמונה קבועה <span className="font-normal text-on-surface-variant">(לא חובה)</span>
          </span>
          <Input
            type="file"
            name="asset"
            accept={RESERVATION_ACCEPT_ATTRIBUTE}
            data-testid="reserved-asset"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPickedUrl(file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
            }}
          />
          <span className="mt-1 block text-xs text-on-surface-variant">
            הלוגו נבחר פעם אחת ומופיע באזור הזה בכל גיליון.
          </span>
          {state.errors?.asset ? <InlineError>{state.errors.asset}</InlineError> : null}
        </label>
      </div>

      <AreaPicker
        grid={grid}
        value={rect}
        others={others}
        onChange={setRect}
        imageSrc={imageSrc}
        label={name}
      />
      {state.errors?.area ? <InlineError>{state.errors.area}</InlineError> : null}

      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !rect} data-testid="reserved-save">
          {pending ? "שומר…" : "שמירה"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDone()}>
          ביטול
        </Button>
      </div>
    </form>
  );
}

/**
 * Drag across a picture of the page — or two clicks, one corner then the
 * other — or one of the ready-made placements above it.
 *
 * No left/right arithmetic here either — cells are emitted in reading order
 * inside a `dir="rtl"` grid, so `col = 0` lands on the RIGHT, which is what
 * `col = 0` means everywhere else in this app (lib/domain/slot-geometry.ts).
 */
function AreaPicker({
  grid,
  value,
  others,
  onChange,
  imageSrc,
  label,
}: {
  grid: DerivedGrid;
  value: GridRect | null;
  others: ReservedAreaRow[];
  onChange: (rect: GridRect) => void;
  /** The logo, drawn inside the area at its real place and size. */
  imageSrc: string | null;
  label: string;
}) {
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [hover, setHover] = useState<Cell | null>(null);
  const [dragging, setDragging] = useState(false);

  const spanning = anchor && hover ? rectBetween(anchor, hover) : null;
  const shown = spanning ?? value;

  const finish = (cell: Cell) => {
    if (!anchor) return;
    onChange(rectBetween(anchor, cell));
    setAnchor(null);
    setDragging(false);
  };

  // A band of about a tenth of the page — the usual height of a masthead.
  const band = Math.max(1, Math.round(grid.rows * 0.1));
  const quarter = Math.max(1, Math.round(grid.columns / 4));
  const presets: Array<{ id: string; label: string; rect: GridRect }> = [
    { id: "top", label: "רצועה עליונה", rect: { col: 0, row: 0, cols: grid.columns, rows: band } },
    {
      id: "bottom",
      label: "רצועה תחתונה",
      rect: { col: 0, row: grid.rows - band, cols: grid.columns, rows: band },
    },
    {
      id: "top-right",
      label: "פינה עליונה ימנית",
      rect: { col: 0, row: 0, cols: quarter, rows: band },
    },
    {
      id: "top-left",
      label: "פינה עליונה שמאלית",
      rect: { col: grid.columns - quarter, row: 0, cols: quarter, rows: band },
    },
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5" data-testid="reserved-presets">
        {presets.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant="secondary"
            data-testid={`reserved-preset-${p.id}`}
            onClick={() => {
              setAnchor(null);
              onChange(p.rect);
            }}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <p className="mb-1 text-xs text-on-surface-variant">
        {anchor
          ? "עכשיו לחצי על הפינה הנגדית (או שחררי את הגרירה)"
          : "גררי על העמוד כדי לסמן את האזור — או לחצי על פינה אחת ואז על הנגדית"}
        {shown ? (
          <>
            {" · "}
            <Ltr>{shortSize(shown, grid)}</Ltr> ס״מ
          </>
        ) : null}
      </p>

      <div
        dir="rtl"
        data-testid="reserved-picker"
        style={{
          aspectRatio: `${grid.pageWidthMm} / ${grid.pageHeightMm}`,
          gridTemplateColumns: `repeat(${grid.columns}, 1fr)`,
          gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
        }}
        className="relative grid w-full max-w-72 touch-none select-none gap-px rounded-sm border border-outline bg-outline-variant/40 p-px shadow-elevation-1"
        onPointerLeave={() => (dragging ? undefined : setHover(null))}
      >
        {Array.from({ length: grid.rows }).flatMap((_, row) =>
          Array.from({ length: grid.columns }).map((__, col) => (
            <button
              key={`${col}-${row}`}
              type="button"
              aria-label={`עמודה ${col + 1} שורה ${row + 1}`}
              data-testid={`reserved-cell-${col}-${row}`}
              onPointerDown={(e) => {
                // Pointer capture would pin every move to this cell; the drag
                // reads the cell under the pointer instead.
                (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
                if (anchor) {
                  finish([col, row]);
                  return;
                }
                setAnchor([col, row]);
                setHover([col, row]);
                setDragging(true);
              }}
              onPointerEnter={() => setHover([col, row])}
              onPointerUp={() => {
                // Released on the same cell: that was a click, wait for the
                // second corner. Released elsewhere: the drag drew the area.
                if (dragging && anchor && (anchor[0] !== col || anchor[1] !== row)) {
                  finish([col, row]);
                } else setDragging(false);
              }}
              onFocus={() => setHover([col, row])}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                if (anchor) finish([col, row]);
                else setAnchor([col, row]);
              }}
              className="bg-surface-container-lowest"
            />
          )),
        )}

        {others.map((other) => (
          <span
            key={other.id}
            aria-hidden
            style={styleOf(other, grid)}
            className="pointer-events-none absolute rounded-[2px] border border-dashed border-outline bg-surface-container"
          />
        ))}

        {shown ? (
          <span
            aria-hidden
            data-testid="reserved-preview"
            style={styleOf(shown, grid)}
            className={cn(
              "pointer-events-none absolute flex items-center justify-center overflow-hidden rounded-[2px] border-2",
              "border-primary bg-status-accent-bg/70",
            )}
          >
            {imageSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={imageSrc} alt="" className="size-full object-contain" />
            ) : label ? (
              <span className="truncate px-1 text-[10px] font-medium text-on-surface">{label}</span>
            ) : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** The rectangle two corner cells describe, in either order. */
function rectBetween(a: Cell, b: Cell): GridRect {
  const col = Math.min(a[0], b[0]);
  const row = Math.min(a[1], b[1]);
  return {
    col,
    row,
    cols: Math.abs(a[0] - b[0]) + 1,
    rows: Math.abs(a[1] - b[1]) + 1,
  };
}

function styleOf(rect: GridRect, grid: DerivedGrid) {
  const pct = toCanvasPercent(rect, grid);
  return {
    insetInlineStart: `${pct.startPct}%`,
    top: `${pct.topPct}%`,
    width: `${pct.widthPct}%`,
    height: `${pct.heightPct}%`,
  };
}
