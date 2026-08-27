"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { DEFAULT_MAX_AD_FILE_SIZE_MB } from "@/lib/domain/newspaper";
import { cmToMm, deriveGrid, formatCm } from "@/lib/domain/grid";
import { PAGE_SIZE_KEYS, PAGE_SIZE_LABELS, type PageSizeKey } from "@/lib/domain/page-size";
import { formatDays, WEEKDAYS, WEEKDAY_LABELS } from "@/lib/domain/publication-days";
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
  printQuality: "",
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
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: NewspaperFormValues;
  submitLabel?: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [pageSize, setPageSize] = useState<PageSizeKey>(initial.pageSize);
  const [days, setDays] = useState<number[]>(initial.publicationDays);
  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  const [marginCm, setMarginCm] = useState(initial.marginCm);
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

  return (
    <form action={formAction} className="max-w-[560px] space-y-5">
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
          className="h-10 w-full rounded-sm border border-outline-variant bg-surface-container px-3 text-start text-sm"
        >
          {PAGE_SIZE_KEYS.map((k) => (
            <option key={k} value={k}>
              {PAGE_SIZE_LABELS[k]}
            </option>
          ))}
        </select>
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
        <Label htmlFor="printQuality">איכות דפוס</Label>
        {/* Free text, exactly as the ERD defines it — deliberately not a dpi
            picker: dpi/CMYK/bleed were Stitch inventions (design/gaps.md §א). */}
        <Input
          id="printQuality"
          name="printQuality"
          defaultValue={initial.printQuality}
          placeholder="לדוגמה: דפוס אופסט רגיל"
          required
        />
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
