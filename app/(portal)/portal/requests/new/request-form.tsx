"use client";

import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, FileUp, Info, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
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

/**
 * The request form (docs/design/screens/06-portal-request.md).
 *
 * Everything offered depends on the newspaper: its sizes (US-009 AC-3), its
 * print days and its file ceiling (AC-4). So choosing another newspaper clears
 * the size and the date — keeping a size the new paper does not sell would
 * submit a request the server refuses for a reason nobody on screen chose.
 * The file stays: it is re-measured against the new ceiling on submit.
 */
export function RequestForm({ newspapers }: { newspapers: PortalFormNewspaper[] }) {
  const [newspaperId, setNewspaperId] = useState(newspapers.length === 1 ? newspapers[0]!.id : "");
  const [shapeId, setShapeId] = useState("");
  const [date, setDate] = useState("");
  const [ad, setAd] = useState<UploadedAd | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, startUpload] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const [state, submit, submitting] = useActionState<PortalRequestState, FormData>(
    submitAdRequestAction,
    {},
  );

  const paper = newspapers.find((n) => n.id === newspaperId) ?? null;

  const chooseNewspaper = (id: string) => {
    setNewspaperId(id);
    setShapeId("");
    setDate("");
    setUploadError(null);
  };

  // A browser restoring the form on "back" writes the select before React
  // hydrates, and the state would never learn of it (CLAUDE.md). Adopt it.
  const adoptNewspaper = (el: HTMLSelectElement | null) => {
    if (el && el.value && el.value !== newspaperId) setNewspaperId(el.value);
  };

  const upload = (file: File) => {
    if (!paper) return;
    setUploadError(null);
    const body = new FormData();
    body.set("newspaperId", paper.id);
    body.set("file", file);
    startUpload(async () => {
      const result = await uploadPortalAdAction({}, body);
      if (result.ad) setAd(result.ad);
      else setUploadError(result.message ?? "ההעלאה נכשלה");
      if (fileInput.current) fileInput.current.value = "";
    });
  };

  // The ceiling shown is the chosen newspaper's, never a constant (FR-21), and
  // an already-uploaded file that no longer fits is said out loud here rather
  // than discovered on submit.
  const tooLarge = Boolean(paper && ad && ad.fileSize > paper.maxAdFileSize);
  const errors = state.errors ?? {};

  return (
    <form action={submit} className="space-y-8" data-testid="request-form">
      {/* Newspaper */}
      <div>
        <Label htmlFor="newspaperId" className="mb-2 block font-semibold">
          עיתון
        </Label>
        <select
          id="newspaperId"
          name="newspaperId"
          ref={adoptNewspaper}
          value={newspaperId}
          onChange={(e) => chooseNewspaper(e.target.value)}
          className="h-11 w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-3"
          required
        >
          <option value="">בחרי מהרשימה…</option>
          {newspapers.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
        <FieldError message={errors.newspaperId} />
      </div>

      {/* Date — exactly one (US-009 AC-2) */}
      <fieldset disabled={!paper}>
        <legend className="mb-2 font-semibold">תאריך פרסום</legend>
        <input type="hidden" name="publicationDate" value={date} />
        {paper ? (
          <SingleDatePicker
            key={paper.id}
            value={date}
            onChange={setDate}
            publicationDays={paper.publicationDays}
            newspaperName={paper.name}
          />
        ) : (
          <p className="text-sm text-on-surface-variant">בחרי קודם עיתון, ויוצגו ימי ההדפסה שלו.</p>
        )}
        <FieldError message={errors.publicationDate} />
      </fieldset>

      {/* Size — from AllowedAdShape of the chosen newspaper (US-009 AC-3) */}
      <fieldset disabled={!paper}>
        <legend className="mb-2 font-semibold">גודל המודעה</legend>
        <input type="hidden" name="adShapeId" value={shapeId} />
        {!paper ? (
          <p className="text-sm text-on-surface-variant">הגדלים תלויים בעיתון שנבחר.</p>
        ) : paper.shapes.length === 0 ? (
          <p className="text-sm text-on-surface-variant">לעיתון הזה עדיין לא הוגדרו גדלי מודעות.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="shape-options">
            {paper.shapes.map((s) => {
              const chosen = s.id === shapeId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setShapeId(s.id)}
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
                </button>
              );
            })}
          </div>
        )}
        <FieldError message={errors.adShapeId} />
      </fieldset>

      {/* File (US-009 AC-4) */}
      <fieldset disabled={!paper}>
        <legend className="mb-2 font-semibold">קובץ המודעה</legend>
        <input type="hidden" name="advertisementId" value={ad?.id ?? ""} />
        <div
          className={cn(
            "rounded-lg border border-dashed p-5",
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
              >
                החלפת קובץ
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={!paper || uploading}
              className="flex w-full flex-col items-center gap-2 py-4 text-sm disabled:opacity-50"
              data-testid="upload-trigger"
            >
              {uploading ? (
                <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
              ) : (
                <FileUp className="size-6 text-primary" aria-hidden />
              )}
              <span className="font-medium">
                {uploading ? "מעלה ובודק את הקובץ…" : "בחירת קובץ"}
              </span>
            </button>
          )}
          <p
            className="mt-3 text-center text-xs text-on-surface-variant"
            data-testid="file-requirements"
          >
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
        {tooLarge && paper && ad ? (
          <FieldError
            message={`הקובץ גדול מהמותר לעיתון ${paper.name} (מקסימום ${formatBytes(paper.maxAdFileSize)}). יש להעלות קובץ קטן יותר`}
          />
        ) : null}
        <FieldError message={uploadError ?? errors.advertisementId} />
      </fieldset>

      {state.message ? <InlineError>{state.message}</InlineError> : null}

      {/* US-009 AC-5 — said before the click, not after it. */}
      <div className="space-y-4 border-t border-outline-variant pt-6">
        <p
          data-testid="approval-banner"
          className="flex items-start gap-2 rounded-lg bg-status-info-bg px-4 py-3 text-sm text-status-info-fg"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          הבקשה תישלח לאישור. פרסום ייווצר רק לאחר אישור מערכת העיתון.
        </p>
        <Button
          type="submit"
          size="lg"
          block
          disabled={submitting || uploading || !paper}
          data-testid="submit-request"
        >
          {submitting ? "שולחת…" : "שליחת הבקשה"}
        </Button>
      </div>
    </form>
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
 * One date, on the paper's own calendar.
 *
 * Unlike the internal multi-date picker there is no "special edition" escape
 * hatch: a customer cannot know the paper printed on a Tuesday once, so only
 * print days that are not a chag and not past can be chosen at all.
 */
function SingleDatePicker({
  value,
  onChange,
  publicationDays,
  newspaperName,
}: {
  value: string;
  onChange: (iso: string) => void;
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

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

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
          const isChag = heb?.kind === "chag";
          const open = !d.isPast && !isChag && d.isPublicationDay;
          const chosen = d.iso === value;
          return (
            <button
              key={d.iso}
              type="button"
              disabled={!open}
              onClick={() => onChange(d.iso)}
              aria-pressed={chosen}
              data-testid={`day-${d.iso}`}
              title={isChag ? `${heb?.holiday} — לא יוצא עיתון בחג` : undefined}
              className={cn(
                "flex h-12 flex-col items-center justify-center rounded-sm text-sm leading-tight",
                !open && "cursor-not-allowed opacity-35",
                chosen
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
      <p className="mt-3 text-xs text-on-surface-variant">
        {scheduled
          ? `${newspaperName} יוצא ${formatDays(publicationDays)}`
          : `אפשר לבחור כל יום שאינו חג`}
      </p>
    </div>
  );
}
