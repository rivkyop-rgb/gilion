"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heading } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import {
  HEADER_DATE_LABELS,
  HEADER_DATE_MODES,
  MARK_SIZE_MAX_MM,
  MARK_SIZE_MIN_MM,
  type HeaderDateMode,
} from "@/lib/domain/page-marks";
import { setPageMarksAction } from "../../actions";

export type PageMarksValue = {
  folioEnabled: boolean;
  folioSizeMm: number;
  headerName: boolean;
  headerDate: HeaderDateMode;
  headerSizeMm: number;
  tearSheetHeader: boolean;
};

/**
 * What every page of this newspaper carries in its margins (14/10/2026): the
 * running page number at the foot, the name and the date at the head — and
 * whether a tear sheet gets a caption saying what it is.
 *
 * The preview line shows the head as it will read, with today's date in the
 * chosen form, so "עברי ולועזי" is something seen rather than imagined.
 */
export function PageMarksSettings({
  newspaperId,
  newspaperName,
  initial,
  previews,
  readOnly,
}: {
  newspaperId: string;
  newspaperName: string;
  initial: PageMarksValue;
  /** Today's date in each mode, computed on the server. */
  previews: Record<HeaderDateMode, string | null>;
  readOnly: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [sizes, setSizes] = useState({
    folio: String(initial.folioSizeMm),
    header: String(initial.headerSizeMm),
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  const set = <K extends keyof PageMarksValue>(key: K, v: PageMarksValue[K]) => {
    setSaved(false);
    setValue((prev) => ({ ...prev, [key]: v }));
  };

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await setPageMarksAction(newspaperId, {
        ...value,
        folioSizeMm: Number(sizes.folio),
        headerSizeMm: Number(sizes.header),
      });
      if (result.message) setError(result.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  const headPreview = [value.headerName ? newspaperName : null, previews[value.headerDate]]
    .filter(Boolean)
    .join("   ·   ");

  return (
    <section
      className="mb-8 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1"
      data-testid="page-marks-settings"
    >
      <h2 className="mb-1 flex items-center gap-2 font-serif text-xl font-semibold">
        <Heading className="size-5" aria-hidden />
        מספור וכותרת בעמוד
      </h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        מה מודפס בשוליים של כל עמוד: המספור הרץ בתחתית, שם העיתון והתאריך בראש. השוליים אינם נמכרים,
        ולכן שום סימון לא יעלה על מודעה.
      </p>

      <fieldset disabled={readOnly || busy} className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.folioEnabled}
              onChange={(e) => set("folioEnabled", e.target.checked)}
              data-testid="marks-folio"
            />
            מספור עמודים רץ (בתחתית העמוד)
          </label>
          <SizeField
            id="folio-size"
            label="גודל המספור"
            value={sizes.folio}
            disabled={!value.folioEnabled}
            onChange={(v) => {
              setSaved(false);
              setSizes((s) => ({ ...s, folio: v }));
            }}
          />
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.headerName}
              onChange={(e) => set("headerName", e.target.checked)}
              data-testid="marks-header-name"
            />
            שם העיתון בראש העמוד
          </label>
          <div>
            <Label htmlFor="header-date">תאריך בראש העמוד</Label>
            <select
              id="header-date"
              value={value.headerDate}
              onChange={(e) => set("headerDate", e.target.value as HeaderDateMode)}
              data-testid="marks-header-date"
              className="h-9 rounded-lg border border-outline-variant bg-surface-container px-2 text-sm"
            >
              {HEADER_DATE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {HEADER_DATE_LABELS[mode]}
                </option>
              ))}
            </select>
          </div>
          <SizeField
            id="header-size"
            label="גודל הכותרת"
            value={sizes.header}
            disabled={!value.headerName && value.headerDate === "none"}
            onChange={(v) => {
              setSaved(false);
              setSizes((s) => ({ ...s, header: v }));
            }}
          />
        </div>

        <p
          className="rounded-lg border border-dashed border-outline-variant p-2 text-sm"
          data-testid="marks-preview"
        >
          <span className="text-on-surface-variant">כך תיראה הכותרת: </span>
          {headPreview || <span className="text-on-surface-variant">(בלי כותרת)</span>}
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.tearSheetHeader}
            onChange={(e) => set("tearSheetHeader", e.target.checked)}
            data-testid="marks-tear-sheet"
          />
          בגזירים ללקוחות: פס עליון עם שם העיתון, התאריך ומספר העמוד
        </label>
      </fieldset>

      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}

      {!readOnly ? (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={busy} data-testid="marks-save">
            {busy ? "שומרת…" : "שמירה"}
          </Button>
          {saved ? (
            <span className="text-sm text-status-success-fg" data-testid="marks-saved">
              נשמר. ייכנס לתוקף ב־PDF הבא שיופק.
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SizeField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>
        {label} (מ״מ, {MARK_SIZE_MIN_MM}–{MARK_SIZE_MAX_MM})
      </Label>
      <Input
        id={id}
        type="number"
        step="0.5"
        min={MARK_SIZE_MIN_MM}
        max={MARK_SIZE_MAX_MM}
        dir="ltr"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-24"
      />
    </div>
  );
}
