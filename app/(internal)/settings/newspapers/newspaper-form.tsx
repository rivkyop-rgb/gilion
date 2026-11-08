"use client";

import { inexactShapesNote } from "@/lib/domain/base-shapes";
import { useMemo, useState } from "react";
import { useFormActionState } from "@/components/use-form-action-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { DEFAULT_MAX_AD_FILE_SIZE_MB } from "@/lib/domain/newspaper";
import { cmToMm, deriveGrid, formatCm } from "@/lib/domain/grid";
import {
  PAGE_SIZE_HINTS,
  PAGE_SIZE_KEYS,
  PAGE_SIZE_LABELS,
  PAGE_SIZES,
  type PageSizeKey,
} from "@/lib/domain/page-size";
import {
  normalizePrintQuality,
  PRINT_QUALITIES,
  PRINT_QUALITY_HINTS,
  PRINT_QUALITY_LABELS,
} from "@/lib/domain/print-quality";
import { formatDays, WEEKDAYS, WEEKDAY_LABELS } from "@/lib/domain/publication-days";
import { gridChanged, planRescale, type RescaleShape } from "@/lib/domain/shape-rescale";
import type { FormState } from "../actions";

/** Every measurement here is in CENTIMETRES — see the note in actions.ts. */
export type NewspaperFormValues = {
  name: string;
  pageSize: PageSizeKey;
  customWidthCm: string;
  customHeightCm: string;
  marginCm: string;
  printQuality: string;
  maxAdFileSizeMb: string;
  columns: string;
  rowHeightCm: string;
  gutterCm: string;
  /** Weekday numbers 0..6. Empty = no schedule declared. */
  publicationDays: number[];
};

const EMPTY: NewspaperFormValues = {
  name: "",
  pageSize: "Tabloid",
  customWidthCm: "",
  customHeightCm: "",
  marginCm: "0.95",
  printQuality: "standard",
  maxAdFileSizeMb: String(DEFAULT_MAX_AD_FILE_SIZE_MB),
  // A 1 cm module in both directions, with no gutter. That combination is what
  // makes every whole-centimetre size actually exist — anything coarser snaps
  // the number the user typed to one they did not ask for. The 0.95 cm margin
  // is chosen so the usable width divides into whole centimetres.
  columns: "26",
  rowHeightCm: "1",
  gutterCm: "0",
  // Empty by default rather than guessing a weekday: a wrong default would
  // start warning about correct dates, which trains the user to ignore the
  // warning — worse than having no schedule at all.
  publicationDays: [],
};

export function NewspaperForm({
  action,
  initial = EMPTY,
  submitLabel = "שמירה",
  cancelHref,
  catalogue,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: NewspaperFormValues;
  submitLabel?: string;
  cancelHref: string;
  /**
   * The newspaper's shapes, so the form can say what resizing the page will do
   * to them BEFORE it is saved. Absent when creating: there is no catalogue to
   * disturb yet, it is about to be created from these very numbers.
   */
  catalogue?: RescaleShape[];
}) {
  const [state, formAction, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    action,
    {},
  );
  const [pageSize, setPageSize] = useState<PageSizeKey>(initial.pageSize);
  const [days, setDays] = useState<number[]>(initial.publicationDays);
  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  const [marginCm, setMarginCm] = useState(initial.marginCm);
  const [quality, setQuality] = useState(normalizePrintQuality(initial.printQuality));
  const err = (f: string) => state.errors?.[f];

  // The grid the user is typing, resolved live. The row count and column width
  // are derived and never stored, so showing them here is the only way the user
  // can see what their three numbers actually produce.
  const [gridInput, setGridInput] = useState({
    columns: initial.columns,
    rowHeightCm: initial.rowHeightCm,
    gutterCm: initial.gutterCm,
    customWidthCm: initial.customWidthCm,
    customHeightCm: initial.customHeightCm,
  });
  const patchGrid = (key: keyof typeof gridInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setGridInput((g) => ({ ...g, [key]: e.target.value }));

  // The grid as it is SAVED, not as it is being typed — the plan compares the
  // two. Built from `initial` and therefore stable across keystrokes.
  const startGrid = useMemo(
    () =>
      deriveGrid({
        pageSize: initial.pageSize,
        customWidthMm: numOrNull(initial.customWidthCm),
        customHeightMm: numOrNull(initial.customHeightCm),
        marginMm: cmToMm(Number(initial.marginCm)),
        columns: Number(initial.columns),
        rowHeightMm: cmToMm(Number(initial.rowHeightCm)),
        gutterMm: cmToMm(Number(initial.gutterCm)),
      }),
    [initial],
  );

  const derived = deriveGrid({
    pageSize,
    customWidthMm: numOrNull(gridInput.customWidthCm),
    customHeightMm: numOrNull(gridInput.customHeightCm),
    marginMm: cmToMm(Number(marginCm)),
    columns: Number(gridInput.columns),
    rowHeightMm: cmToMm(Number(gridInput.rowHeightCm)),
    gutterMm: cmToMm(Number(gridInput.gutterCm)),
  });
  // What the three numbers actually produce, in the unit the user thinks in.
  // Column width is shown and never typed: it is whatever the page leaves over,
  // and it almost never lands on a whole centimetre.
  const gridReadable =
    derived && derived.rows >= 1 && derived.columnWidthMm > 0
      ? `${derived.columns} עמודות × ${derived.rows} שורות · עמודה ${formatCm(derived.columnWidthMm)} ס״מ · שורה ${formatCm(derived.rowHeightMm)} ס״מ`
      : null;

  /**
   * What saving would do to the shape catalogue.
   *
   * Computed here from `planRescale` — the SAME pure module `updateNewspaper`
   * applies on the server, so the preview cannot describe one outcome while the
   * write performs another. The server still decides; this only tells the truth
   * early, which is the rule the centimetre snapping already follows: a number
   * that changes itself without warning reads as a bug (CLAUDE.md).
   */
  const plan =
    catalogue && derived && startGrid && gridChanged(startGrid, derived) && derived.rows >= 1
      ? planRescale(catalogue, startGrid, derived)
      : null;

  return (
    <form action={formAction} onReset={keepTypedOnError} className="max-w-[560px] space-y-5">
      <div>
        <Label htmlFor="name">שם העיתון</Label>
        <Input id="name" name="name" defaultValue={initial.name} required />
        {err("name") ? <InlineError>{err("name")}</InlineError> : null}
      </div>

      <div>
        <Label htmlFor="pageSize">גודל עמוד</Label>
        <select
          id="pageSize"
          name="pageSize"
          value={pageSize}
          onChange={(e) => setPageSize(e.target.value as PageSizeKey)}
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
        >
          {PAGE_SIZE_KEYS.map((k) => (
            <option key={k} value={k}>
              {PAGE_SIZE_LABELS[k]}
            </option>
          ))}
        </select>
        <PageSizeHint size={pageSize} />
        {err("pageSize") ? <InlineError>{err("pageSize")}</InlineError> : null}
      </div>

      {pageSize === "custom" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="customWidthCm">רוחב בס״מ</Label>
            <Input
              id="customWidthCm"
              name="customWidthCm"
              dir="ltr"
              type="number"
              step="0.1"
              value={gridInput.customWidthCm}
              onChange={patchGrid("customWidthCm")}
            />
          </div>
          <div>
            <Label htmlFor="customHeightCm">גובה בס״מ</Label>
            <Input
              id="customHeightCm"
              name="customHeightCm"
              dir="ltr"
              type="number"
              step="0.1"
              value={gridInput.customHeightCm}
              onChange={patchGrid("customHeightCm")}
            />
          </div>
          {err("customWidthMm") ? <InlineError>{err("customWidthMm")}</InlineError> : null}
        </div>
      ) : null}

      <div>
        <Label htmlFor="marginCm">שוליים בס״מ</Label>
        <Input
          id="marginCm"
          name="marginCm"
          dir="ltr"
          type="number"
          step="0.1"
          value={marginCm}
          onChange={(e) => setMarginCm(e.target.value)}
        />
        {err("margin") ? <InlineError>{err("margin")}</InlineError> : null}
      </div>

      <fieldset className="rounded-lg border border-outline-variant p-4">
        <legend className="px-1 font-serif text-base font-semibold">חלוקת העמוד</legend>
        <p className="mb-4 text-sm text-on-surface-variant">
          העמוד מחולק לריבועים, וכל מודעה תופסת מספר שלם מהם. זה מה שקובע{" "}
          <strong>אילו גדלים בכלל קיימים</strong>: אם ריבוע הוא 1 ס״מ, כל מספר שלם של ס״מ אפשרי; אם
          הוא 4 ס״מ, מודעה יכולה להיות 4 או 8 ס״מ ולא 6. מספר השורות ורוחב העמודה נגזרים מגודל העמוד
          ולא מזינים אותם.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="columns">מספר עמודות</Label>
            <Input
              id="columns"
              name="columns"
              dir="ltr"
              type="number"
              min="1"
              max="40"
              value={gridInput.columns}
              onChange={patchGrid("columns")}
              required
            />
          </div>
          <div>
            <Label htmlFor="rowHeightCm">גובה שורה בס״מ</Label>
            <Input
              id="rowHeightCm"
              name="rowHeightCm"
              dir="ltr"
              type="number"
              step="0.1"
              min="0.1"
              value={gridInput.rowHeightCm}
              onChange={patchGrid("rowHeightCm")}
              required
            />
          </div>
          <div>
            <Label htmlFor="gutterCm">מרווח בס״מ</Label>
            <Input
              id="gutterCm"
              name="gutterCm"
              dir="ltr"
              type="number"
              step="0.1"
              min="0"
              value={gridInput.gutterCm}
              onChange={patchGrid("gutterCm")}
              required
            />
          </div>
        </div>

        <p className="mt-2 text-xs text-on-surface-variant">
          המרווח חל בין תא לתא וגם בין התאים החיצוניים למסגרת. מרווח שאינו אפס מקצר כל גודל מודפס
          בדיוק בגודלו, ולכן ברירת המחדל היא אפס — כך מודעה של 10 שורות יוצאת 10 ס״מ בדיוק.
        </p>

        <p
          data-testid="grid-derived"
          className="mt-3 rounded-sm bg-surface-container px-3 py-2 text-sm"
        >
          {gridReadable ? <Ltr>{gridReadable}</Ltr> : "החלוקה הזאת לא מייצרת גריד שאפשר לעבוד איתו"}
        </p>
        {derived && derived.rows >= 1 ? (
          <>
            <InexactColumns grid={derived} />
            <RowLeftover grid={derived} />
          </>
        ) : null}

        {plan && (plan.rescaled.length > 0 || plan.warnings.length > 0) ? (
          <div
            data-testid="rescale-preview"
            className="mt-3 rounded-lg border border-status-warning-fg/40 bg-status-warning-bg/40 p-3 text-sm"
          >
            <p className="mb-2 font-medium">שינוי החלוקה משנה גם את קטלוג הצורות</p>

            {plan.rescaled.length > 0 ? (
              <>
                <p className="mb-1 text-xs text-on-surface-variant">
                  צורות הבסיס נשמרות ביחס לעמוד — חצי עמוד יישאר חצי מהעמוד החדש:
                </p>
                <ul className="mb-2 space-y-0.5" data-testid="rescale-list">
                  {plan.rescaled.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{c.name}</span>
                      <Ltr className="text-xs text-on-surface-variant">
                        {c.from.cols}×{c.from.rows} → {c.to.cols}×{c.to.rows}
                      </Ltr>
                      {/* The printed size, when it moved at all. Halving a page
                          of 41 one-centimetre rows and one of 27 rows of 1.5 cm
                          both give 21 cm — the cells change and the paper does
                          not, and that is the outcome being aimed at. */}
                      {c.note ? (
                        <Ltr className="text-xs">{c.note}</Ltr>
                      ) : (
                        <span className="text-xs text-status-success-fg">אותו גודל מודפס</span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {plan.warnings.length > 0 ? (
              <ul className="space-y-0.5 text-status-error-fg" data-testid="rescale-warnings">
                {plan.warnings.map((c) => (
                  <li key={c.id}>
                    <span className="font-medium">{c.name}</span> — {c.note}
                  </li>
                ))}
              </ul>
            ) : null}

            <p className="mt-2 text-xs text-on-surface-variant">
              גיליונות שכבר נפתחו לא ישתנו — כל גיליון מחזיק צילום משלו של החלוקה. המחירון נשאר על
              כנו, כך שאותו מחיר יקנה עכשיו שטח אחר.
            </p>
          </div>
        ) : null}

        {err("columns") ? <InlineError>{err("columns")}</InlineError> : null}
        {err("rowHeightMm") ? <InlineError>{err("rowHeightMm")}</InlineError> : null}
        {err("gutterMm") ? <InlineError>{err("gutterMm")}</InlineError> : null}
      </fieldset>

      <fieldset className="rounded-lg border border-outline-variant p-4">
        <legend className="px-1 font-serif text-base font-semibold">ימי הדפסה</legend>
        <p className="mb-3 text-sm text-on-surface-variant">
          באילו ימים בשבוע העיתון יוצא. בהזמנת פרסום המערכת תסמן את הימים האלה בלוח התאריכים ותתריע
          אם נבחר תאריך אחר. אפשר להשאיר ריק — אז לא תהיה שום התרעה.
        </p>

        <div className="flex flex-wrap gap-2" data-testid="publication-days">
          {WEEKDAYS.map((d) => {
            const on = days.includes(d);
            return (
              <label
                key={d}
                className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition-colors ${
                  on
                    ? "bg-primary text-on-primary ring-primary"
                    : "bg-surface-container-lowest text-on-surface-variant ring-outline-variant hover:bg-surface-container"
                }`}
              >
                <input
                  type="checkbox"
                  name="publicationDays"
                  value={d}
                  checked={on}
                  onChange={() => toggleDay(d)}
                  data-testid={`publication-day-${d}`}
                  className="sr-only"
                />
                {WEEKDAY_LABELS[d]}
              </label>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-on-surface-variant" data-testid="publication-days-summary">
          {formatDays(days)}
        </p>
      </fieldset>

      <div>
        <Label htmlFor="printQuality">איכות הדפסת המודעות ב־PDF</Label>
        {/* A closed list now: only these three words ever changed anything,
            and free text let "דפוס אופסט רגיל" look meaningful while doing
            nothing (the user, 03/11/2026). Older free-text values open as the
            quality they always produced — "standard". */}
        <select
          id="printQuality"
          name="printQuality"
          value={quality}
          onChange={(e) => setQuality(e.target.value as typeof quality)}
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
        >
          {PRINT_QUALITIES.map((q) => (
            <option key={q} value={q}>
              {PRINT_QUALITY_LABELS[q]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-on-surface-variant" data-testid="print-quality-hint">
          {PRINT_QUALITY_HINTS[quality]}
        </p>
        {err("printQuality") ? <InlineError>{err("printQuality")}</InlineError> : null}
      </div>

      <div>
        <Label htmlFor="maxAdFileSizeMb">גודל קובץ מודעה מקסימלי (MB)</Label>
        <Input
          id="maxAdFileSizeMb"
          name="maxAdFileSizeMb"
          dir="ltr"
          type="number"
          step="0.5"
          defaultValue={initial.maxAdFileSizeMb}
          required
        />
        <p className="mt-1 text-xs text-on-surface-variant">
          זה המספר שייאכף בהעלאת מודעה לעיתון הזה. אין מגבלה קשיחה אחרת במערכת.
        </p>
        {err("maxAdFileSizeMb") ? <InlineError>{err("maxAdFileSizeMb")}</InlineError> : null}
      </div>

      {state.message ? (
        state.message === "נשמר" ? (
          <p
            role="status"
            className="rounded-sm bg-status-success-bg px-3 py-2 text-sm text-status-success-fg"
          >
            ההגדרות נשמרו
          </p>
        ) : (
          <InlineError>{state.message}</InlineError>
        )
      ) : null}

      <div className="flex gap-3 border-t border-outline-variant pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "שומרת…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={cancelHref}>ביטול</Link>
        </Button>
      </div>
    </form>
  );
}

/** Custom page dimensions are optional; an empty field is "not set", not zero. */
const numOrNull = (cm: string) => (cm.trim() === "" ? null : cmToMm(Number(cm)));

/** A small drawing of the chosen size beside what it is, at true proportions. */
function PageSizeHint({ size }: { size: PageSizeKey }) {
  const dims = size === "custom" ? null : PAGE_SIZES[size];
  const scale = dims ? 48 / PAGE_SIZES.Broadsheet.height : 0;
  return (
    <div className="mt-2 flex items-center gap-3" data-testid="page-size-hint">
      {dims ? (
        <span
          aria-hidden
          className="shrink-0 rounded-[2px] border border-outline bg-surface-container-lowest shadow-elevation-1"
          style={{ width: Math.round(dims.width * scale), height: Math.round(dims.height * scale) }}
        />
      ) : null}
      <p className="text-xs text-on-surface-variant">{PAGE_SIZE_HINTS[size]}</p>
    </div>
  );
}

/**
 * A column count that does not halve (08/11/2026): the halves and quarters are
 * not created at all rather than sold at 40% of a page — said here, before
 * saving, with the two counts that would make them.
 */
function InexactColumns({ grid }: { grid: { columns: number; rows: number } }) {
  const note = inexactShapesNote(grid);
  if (!note) return null;
  return (
    <p
      data-testid="grid-inexact"
      className="mt-2 rounded-sm bg-status-warning-bg px-3 py-2 text-xs text-status-warning-fg"
    >
      {note}
    </p>
  );
}

/**
 * The page height rarely divides by the shapes a publisher sells, and the rest
 * shows up as a thin unused strip under two halves (the user, 03/11/2026). Say
 * so here, where it can be fixed, with the two changes that would close it.
 */
function RowLeftover({ grid }: { grid: { rows: number; rowHeightMm: number; pageHeightMm: number; marginMm: number } }) {
  if (grid.rows % 2 === 0) return null;
  const halfMm = grid.rowHeightMm / 2;
  return (
    <p
      data-testid="grid-leftover"
      className="mt-2 rounded-sm bg-status-warning-bg px-3 py-2 text-xs text-status-warning-fg"
    >
      מספר השורות (<Ltr>{grid.rows}</Ltr>) אי־זוגי, ולכן מתחת לשני חצאי עמוד תישאר רצועה ריקה של
      שורה אחת (<Ltr>{formatCm(grid.rowHeightMm)}</Ltr> ס״מ). כדי לסגור אותה: להגדיל את השוליים
      בכ־<Ltr>{formatCm(halfMm)}</Ltr> ס״מ, או לקבוע גובה שורה של חצי מהגובה הנוכחי.
    </p>
  );
}
