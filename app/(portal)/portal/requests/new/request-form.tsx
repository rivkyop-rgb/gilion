"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileUp,
  Images,
  Info,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { orderPricing } from "@/lib/domain/ad-package";
import { AD_ACCEPT_ATTRIBUTE, formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { jewishMonth } from "@/lib/domain/jewish-calendar";
import {
  formatDays,
  hasSchedule,
  monthDays,
  todayIso,
  WEEKDAYS,
  WEEKDAY_SHORT,
} from "@/lib/domain/publication-days";
import { MAX_LINES } from "@/lib/domain/portal-request";
import type { PortalFormNewspaper } from "@/lib/data/portal";
import { AdThumb } from "@/components/ads/ad-preview";
import { ShapePreview } from "@/app/(internal)/settings/shape-preview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import {
  submitAdRequestAction,
  uploadPortalAdAction,
  type PortalRequestState,
  type PortalUploadState,
} from "../../actions";

type UploadedAd = NonNullable<PortalUploadState["ad"]>;

type Line = {
  key: number;
  newspaperId: string;
  shapeId: string;
  dates: string[];
  adId: string;
};

const MONEY = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});

/**
 * The request form (docs/design/screens/06-portal-request.md, backlog 26).
 *
 * A request is LINES: a size in a newspaper, on as many dates as the customer
 * wants, with a file. The same advertisement several times is one line with
 * several dates; a full page on one date and a quarter on another is two lines.
 * A file uploaded on one line can be picked on another, so the same artwork is
 * never uploaded twice.
 *
 * Choosing another newspaper on a line clears that line's size and dates —
 * keeping a size the new paper does not sell would submit a request the server
 * refuses for a reason nobody on screen chose. The file stays; the server
 * measures it against that line's newspaper on submit, and the line says so
 * beforehand when it no longer fits.
 */
export function RequestForm({
  newspapers,
  library = [],
}: {
  newspapers: PortalFormNewspaper[];
  /** Files this customer uploaded before, in earlier requests (backlog 28). */
  library?: UploadedAd[];
}) {
  const counter = useRef(1);
  const single = newspapers.length === 1 ? newspapers[0]!.id : "";
  const [lines, setLines] = useState<Line[]>([
    { key: 0, newspaperId: single, shapeId: "", dates: [], adId: "" },
  ]);
  // Everything pickable on a line: what they uploaded before, and what they
  // upload while filling this form.
  const [files, setFiles] = useState<UploadedAd[]>(library);

  const [state, submit, submitting] = useActionState<PortalRequestState, FormData>(
    submitAdRequestAction,
    {},
  );
  const errors = state.errors ?? {};

  const update = (key: number, patch: Partial<Line>) =>
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const addLine = () =>
    setLines((all) => {
      const last = all[all.length - 1];
      return [
        ...all,
        {
          key: counter.current++,
          // The next line is usually the same newspaper — "and also a quarter
          // page the week after" — so it starts there.
          newspaperId: last?.newspaperId ?? single,
          shapeId: "",
          dates: [],
          adId: "",
        },
      ];
    });

  const removeLine = (key: number) => setLines((all) => all.filter((l) => l.key !== key));

  // The whole request priced the way approval will price it: every date of
  // every line, packages counted per newspaper across the request.
  const pricing = useMemo(() => {
    const priced: Array<{ newspaperId: string; price: number }> = [];
    let unpriced = 0;
    for (const line of lines) {
      const shape = newspapers
        .find((n) => n.id === line.newspaperId)
        ?.shapes.find((s) => s.id === line.shapeId);
      if (!shape) continue;
      for (let i = 0; i < line.dates.length; i++) {
        if (shape.listPrice === null) unpriced++;
        else priced.push({ newspaperId: line.newspaperId, price: shape.listPrice });
      }
    }
    const packages = Object.fromEntries(newspapers.map((n) => [n.id, n.packages]));
    return { ...orderPricing(priced, packages), count: priced.length + unpriced, unpriced };
  }, [lines, newspapers]);

  const payload = JSON.stringify(
    lines.map((l) => ({
      newspaperId: l.newspaperId,
      adShapeId: l.shapeId,
      dates: l.dates,
      advertisementId: l.adId,
    })),
  );

  return (
    <form action={submit} className="space-y-6" data-testid="request-form">
      <input type="hidden" name="lines" value={payload} />

      {lines.map((line, index) => (
        <LineEditor
          key={line.key}
          index={index}
          line={line}
          newspapers={newspapers}
          files={files}
          errors={errors}
          removable={lines.length > 1}
          onChange={(patch) => update(line.key, patch)}
          onRemove={() => removeLine(line.key)}
          onUploaded={(ad) => {
            setFiles((all) => [ad, ...all]);
            update(line.key, { adId: ad.id });
          }}
        />
      ))}

      {lines.length < MAX_LINES ? (
        <Button
          type="button"
          variant="secondary"
          onClick={addLine}
          data-testid="add-line"
          className="w-full border-dashed"
        >
          <Plus className="size-4" />
          פרסום נוסף — גודל אחר, עיתון אחר או מודעה אחרת
        </Button>
      ) : null}

      {errors.request ? <InlineError>{errors.request}</InlineError> : null}
      {state.message ? <InlineError>{state.message}</InlineError> : null}

      {/* US-009 AC-5 — said before the click, not after it. */}
      <div className="space-y-4 border-t border-outline-variant pt-6">
        <div
          className="flex flex-wrap items-baseline justify-between gap-2"
          data-testid="request-summary"
        >
          <span className="text-sm" data-testid="request-count">
            {pricing.count === 0
              ? "עדיין לא נבחרו תאריכים"
              : pricing.count === 1
                ? "פרסום אחד"
                : `${pricing.count} פרסומים`}
          </span>
          {pricing.count > 0 && pricing.unpriced < pricing.count ? (
            <span className="text-sm">
              מחיר משוער:{" "}
              <Ltr className="text-lg font-semibold" data-testid="form-estimate">
                {MONEY.format(pricing.total)}
              </Ltr>
              {pricing.discount > 0 ? (
                <span className="ms-2 text-xs text-status-success-fg" data-testid="form-discount">
                  כולל הנחת כמות של <Ltr>{MONEY.format(pricing.discount)}</Ltr>
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
        <p
          data-testid="approval-banner"
          className="flex items-start gap-2 rounded-lg bg-status-info-bg px-4 py-3 text-sm text-status-info-fg"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            הבקשה תישלח לאישור. פרסום ייווצר רק לאחר אישור מערכת העיתון, והמחיר נקבע סופית באישור.
            {pricing.unpriced > 0
              ? " לחלק מהגדלים שנבחרו אין מחיר במחירון — העיתון ישלים אותו."
              : null}
          </span>
        </p>
        <Button type="submit" size="lg" block disabled={submitting} data-testid="submit-request">
          {submitting ? "שולחת…" : "שליחת הבקשה"}
        </Button>
      </div>
    </form>
  );
}

function LineEditor({
  index,
  line,
  newspapers,
  files,
  errors,
  removable,
  onChange,
  onRemove,
  onUploaded,
}: {
  index: number;
  line: Line;
  newspapers: PortalFormNewspaper[];
  files: UploadedAd[];
  errors: Record<string, string>;
  removable: boolean;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  onUploaded: (ad: UploadedAd) => void;
}) {
  const paper = newspapers.find((n) => n.id === line.newspaperId) ?? null;
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const [picking, setPicking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const error = (field: string) => errors[`lines.${index}.${field}`];
  const ad = files.find((f) => f.id === line.adId) ?? null;
  const tooLarge = Boolean(paper && ad && ad.fileSize > paper.maxAdFileSize);
  const id = `line-${line.key}`;

  // A browser restoring the form on "back" writes the select before React
  // hydrates, and the state would never learn of it (CLAUDE.md). Adopt it.
  const adoptNewspaper = (el: HTMLSelectElement | null) => {
    if (el && el.value && el.value !== line.newspaperId) onChange({ newspaperId: el.value });
  };

  const upload = (file: File) => {
    if (!paper) return;
    setUploadError(null);
    const body = new FormData();
    body.set("newspaperId", paper.id);
    body.set("file", file);
    startUpload(async () => {
      const result = await uploadPortalAdAction({}, body);
      if (result.ad) onUploaded(result.ad);
      else setUploadError(result.message ?? "ההעלאה נכשלה");
      if (fileInput.current) fileInput.current.value = "";
    });
  };

  return (
    <fieldset
      data-testid="request-line"
      className="space-y-6 rounded-xl border border-outline-variant p-5"
    >
      <legend className="flex items-center gap-2 px-2 text-sm font-semibold">
        פרסום {index + 1}
        {removable ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`הסרת פרסום ${index + 1}`}
            data-testid="remove-line"
            className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </legend>

      {/* Newspaper */}
      <div>
        <Label htmlFor={`${id}-newspaper`} className="mb-2 block font-semibold">
          עיתון
        </Label>
        <select
          id={`${id}-newspaper`}
          ref={adoptNewspaper}
          value={line.newspaperId}
          onChange={(e) => onChange({ newspaperId: e.target.value, shapeId: "", dates: [] })}
          className="h-11 w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3"
          data-testid="line-newspaper"
        >
          <option value="">בחרי מהרשימה…</option>
          {newspapers.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <FieldError message={error("newspaperId")} />
      </div>

      {/* Size — from AllowedAdShape of the chosen newspaper (US-009 AC-3) */}
      <div>
        <p className="mb-2 font-semibold">גודל המודעה</p>
        {!paper ? (
          <p className="text-sm text-on-surface-variant">הגדלים תלויים בעיתון שנבחר.</p>
        ) : paper.shapes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">לעיתון הזה עדיין לא הוגדרו גדלי מודעות.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="shape-options">
            {paper.shapes.map((s) => {
              const chosen = s.id === line.shapeId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onChange({ shapeId: s.id })}
                  aria-pressed={chosen}
                  data-testid="shape-option"
                  data-shape-name={s.name}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors",
                    chosen
                      ? "border-primary bg-surface-container font-semibold"
                      : "border-outline-variant hover:border-outline",
                  )}
                >
                  {paper.grid ? (
                    <ShapePreview
                      cols={s.cols}
                      rows={s.rows}
                      grid={paper.grid}
                      selected={chosen}
                      className="h-20 w-14"
                    />
                  ) : null}
                  <span className="text-center">{s.name}</span>
                  {s.estimate !== null ? (
                    <span
                      className="text-xs font-normal text-on-surface-variant"
                      data-testid="shape-estimate"
                    >
                      <Ltr>{MONEY.format(s.estimate)}</Ltr>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
        <FieldError message={error("adShapeId")} />
      </div>

      {/* Dates — as many as wanted (backlog 26) */}
      <div>
        <p className="mb-2 font-semibold">
          תאריכי פרסום
          {line.dates.length > 0 ? (
            <span
              className="ms-2 text-sm font-normal text-on-surface-variant"
              data-testid="line-date-count"
            >
              {line.dates.length === 1 ? "תאריך אחד נבחר" : `${line.dates.length} תאריכים נבחרו`}
            </span>
          ) : null}
        </p>
        {paper ? (
          <DatesPicker
            key={paper.id}
            value={line.dates}
            onChange={(dates) => onChange({ dates })}
            publicationDays={paper.publicationDays}
            newspaperName={paper.name}
          />
        ) : (
          <p className="text-sm text-on-surface-variant">בחרי קודם עיתון, ויוצגו ימי ההדפסה שלו.</p>
        )}
        <FieldError message={error("dates")} />
      </div>

      {/* File (US-009 AC-4) */}
      <div>
        <p className="mb-2 font-semibold">קובץ המודעה</p>
        <div
          className={cn(
            "space-y-3 rounded-lg border border-dashed p-4",
            tooLarge ? "border-error" : "border-outline-variant",
          )}
        >
          {ad ? (
            <div className="flex items-center gap-4" data-testid="uploaded-ad">
              <AdThumb
                ad={{
                  name: ad.name,
                  fileType: ad.fileType as AdFileType,
                  previewUrl: ad.previewUrl,
                }}
                className="size-16 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{ad.name}</p>
                <p className="text-xs text-on-surface-variant">
                  <Ltr>{formatBytes(ad.fileSize)}</Ltr>
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant={ad ? "secondary" : "primary"}
              size="sm"
              onClick={() => fileInput.current?.click()}
              disabled={!paper || uploading}
              data-testid="upload-trigger"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <FileUp className="size-4" aria-hidden />
              )}
              {uploading ? "מעלה ובודק…" : ad ? "קובץ אחר" : "העלאת קובץ חדש"}
            </Button>

            {/* The customer's own files — earlier requests and this one
                (backlog 28). Shown as pictures: a file name is not a file. */}
            {files.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPicking((open) => !open)}
                aria-expanded={picking}
                data-testid="pick-existing"
              >
                <Images className="size-4" aria-hidden />
                בחירה מהקבצים שלי ({files.length})
              </Button>
            ) : null}
          </div>

          {picking && files.length > 0 ? (
            <div
              className="grid grid-cols-2 gap-2 rounded-lg bg-surface-container p-2 sm:grid-cols-4"
              data-testid="file-library"
            >
              {files.map((f) => {
                const chosen = f.id === line.adId;
                const fits = !paper || f.fileSize <= paper.maxAdFileSize;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      onChange({ adId: f.id });
                      setPicking(false);
                    }}
                    disabled={!fits}
                    aria-pressed={chosen}
                    data-testid="library-file"
                    data-file-name={f.name}
                    title={fits ? f.name : `${f.name} — גדול מהמותר לעיתון ${paper?.name}`}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-sm border p-2 text-xs transition-colors",
                      chosen ? "border-primary bg-surface-container-lowest" : "border-transparent",
                      fits ? "hover:border-outline" : "cursor-not-allowed opacity-40",
                    )}
                  >
                    <AdThumb
                      ad={{
                        name: f.name,
                        fileType: f.fileType as AdFileType,
                        previewUrl: f.previewUrl,
                      }}
                      className="size-16"
                    />
                    <span className="w-full truncate">{f.name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <p className="text-xs text-on-surface-variant" data-testid="file-requirements">
            קובץ <Ltr>PDF / JPG / PNG</Ltr>
            {paper ? (
              <>
                {" "}
                · עד <Ltr>{formatBytes(paper.maxAdFileSize)}</Ltr> לעיתון {paper.name}
              </>
            ) : null}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept={AD_ACCEPT_ATTRIBUTE}
            className="sr-only"
            data-testid="portal-file-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
            }}
          />
        </div>
        {tooLarge && paper ? (
          <FieldError
            message={`הקובץ גדול מהמותר לעיתון ${paper.name} (מקסימום ${formatBytes(paper.maxAdFileSize)}). יש להעלות קובץ קטן יותר`}
          />
        ) : null}
        <FieldError message={uploadError ?? error("advertisementId")} />
      </div>
    </fieldset>
  );
}

function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" data-testid="field-error" className="mt-2 text-sm text-error">
      {message}
    </p>
  );
}

/**
 * Dates on the paper's own calendar, as many as wanted.
 *
 * Unlike the internal picker there is no "special edition" escape hatch: a
 * customer cannot know the paper printed on a Tuesday once, so only print days
 * that are not a chag and not past can be chosen at all.
 */
function DatesPicker({
  value,
  onChange,
  publicationDays,
  newspaperName,
}: {
  value: string[];
  onChange: (dates: string[]) => void;
  publicationDays: number[];
  newspaperName: string;
}) {
  const today = todayIso();
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const days = useMemo(
    () => monthDays(cursor.year, cursor.month, publicationDays, today),
    [cursor, publicationDays, today],
  );
  const jewish = useMemo(() => jewishMonth(cursor.year, cursor.month), [cursor]);
  const scheduled = hasSchedule(publicationDays);
  const chosen = useMemo(() => new Set(value), [value]);

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const toggle = (iso: string) =>
    onChange(chosen.has(iso) ? value.filter((d) => d !== iso) : [...value, iso].sort());

  const isOpen = (d: (typeof days)[number]) =>
    !d.isPast && jewish.get(d.iso)?.kind !== "chag" && d.isPublicationDay;

  /** Every remaining print day in the month — "every week this month". */
  const selectMonth = () =>
    onChange([...new Set([...value, ...days.filter(isOpen).map((d) => d.iso)])].sort());

  const monthLabel = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(
    new Date(cursor.year, cursor.month, 1),
  );
  const lead = days[0]?.weekday ?? 0;
  const now = new Date();
  const atCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth();

  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={atCurrentMonth}
          aria-label="חודש קודם"
          data-testid="prev-month"
          className="rounded-sm p-1 hover:bg-surface-container disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
        <span className="font-semibold" data-testid="calendar-month">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label="חודש הבא"
          data-testid="next-month"
          className="rounded-sm p-1 hover:bg-surface-container"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-on-surface-variant">
        {WEEKDAYS.map((d) => (
          <span key={d}>{WEEKDAY_SHORT[d]}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} />
        ))}
        {days.map((d) => {
          const heb = jewish.get(d.iso);
          const open = isOpen(d);
          const picked = chosen.has(d.iso);
          return (
            <button
              key={d.iso}
              type="button"
              disabled={!open}
              onClick={() => toggle(d.iso)}
              aria-pressed={picked}
              data-testid={`day-${d.iso}`}
              title={heb?.kind === "chag" ? `${heb.holiday} — לא יוצא עיתון בחג` : undefined}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-sm text-sm leading-tight",
                !open && "cursor-not-allowed opacity-35",
                picked
                  ? "bg-primary font-semibold text-on-primary"
                  : open
                    ? "bg-status-info-bg text-status-info-fg hover:brightness-95"
                    : "text-on-surface-variant",
              )}
            >
              <span className="ltr-isolate">{d.day}</span>
              <span className="text-[9px] opacity-70">{heb?.hebrew}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-on-surface-variant">
          {scheduled
            ? `${newspaperName} יוצא ${formatDays(publicationDays)}`
            : "אפשר לבחור כל יום שאינו חג"}
        </p>
        <button
          type="button"
          onClick={selectMonth}
          data-testid="select-whole-month"
          className="text-xs font-medium text-primary underline"
        >
          כל ימי ההדפסה בחודש
        </button>
      </div>
    </div>
  );
}
