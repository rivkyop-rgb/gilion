"use client";

import { useRef, useState } from "react";
import { useFormActionState } from "@/components/use-form-action-state";
import { useRouter } from "next/navigation";
import { CloudUpload, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import {
  AD_ACCEPT_ATTRIBUTE,
  UPLOAD_TRANSPORT_LIMIT_BYTES,
  formatBytes,
  tooLargeMessage,
} from "@/lib/domain/ad-file";
import { cn } from "@/lib/utils";
import { uploadAdvertisementAction, type AdFormState } from "./actions";

export type NewspaperLimit = { id: string; name: string; maxAdFileSize: number };
export type CustomerOption = { id: string; label: string; hint?: string };

/**
 * The upload drawer (docs/design/screens/05-file-management.md).
 *
 * The layout is the design's. The REQUIREMENTS CARD is not: its five invented
 * lines — 300dpi, CMYK, 5mm bleed, a hard 100MB — are Stitch noise
 * (docs/design/gaps.md §א). What is left is the two things the system actually
 * enforces: the three formats, and this newspaper's own max_ad_file_size,
 * which moves the moment a different newspaper is chosen (FR-21).
 */
export function UploadPanel({
  newspapers,
  customers,
}: {
  newspapers: NewspaperLimit[];
  customers: CustomerOption[];
}) {
  const [open, setOpen] = useState(false);
  const [newspaperId, setNewspaperId] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [state, formAction, pending, keepTypedOnError] = useFormActionState<AdFormState, FormData>(
    async (prev, formData) => {
      const next = await uploadAdvertisementAction(prev, formData);
      if (next.ok) {
        setFileName(null);
        setFileSize(0);
        router.refresh();
        // A stored-but-INVALID file also comes back ok — the row exists, it is
        // simply marked. Keeping the panel open in that case is what puts the
        // reason in front of the person who just uploaded it, instead of only
        // on a card they have to go looking for.
        if (!next.message) setOpen(false);
      }
      return next;
    },
    {},
  );

  const chosen = newspapers.find((n) => n.id === newspaperId) ?? null;
  const smallest =
    newspapers.length > 0
      ? newspapers.reduce((a, b) => (b.maxAdFileSize < a.maxAdFileSize ? b : a))
      : null;
  const shown = chosen ?? smallest;
  // Refused here, before a single byte travels (08/11/2026): the habodek run
  // waited out a whole upload of a file the newspaper was always going to
  // refuse. The server still checks — this only saves the wait. The transport
  // ceiling is checked too: above it the request is cut and the server answers
  // "Unexpected end of form" instead of a sentence (CLAUDE.md).
  const ceiling = Math.min(shown?.maxAdFileSize ?? Infinity, UPLOAD_TRANSPORT_LIMIT_BYTES);
  const tooBig =
    fileSize > ceiling
      ? tooLargeMessage(fileSize, {
          maxBytes: ceiling,
          newspaperName: shown?.name ?? "",
        })
      : null;

  const takeFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const dt = new DataTransfer();
    dt.items.add(files[0]!);
    if (inputRef.current) inputRef.current.files = dt.files;
    setFileName(files[0]!.name);
    setFileSize(files[0]!.size);
  };

  if (!open) {
    return (
      <Button data-testid="open-upload" onClick={() => setOpen(true)}>
        <CloudUpload className="size-4" />
        העלאת קובץ חדש
      </Button>
    );
  }

  return (
    <>
      <Button data-testid="open-upload" variant="secondary" onClick={() => setOpen(false)}>
        <X className="size-4" />
        סגירת פאנל ההעלאה
      </Button>

      <form
        action={formAction}
        onReset={keepTypedOnError}
        data-testid="upload-panel"
        className="mt-4 w-full rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4 lg:w-[500px]"
      >
        <h2 className="mb-4 font-serif text-xl font-semibold">העלאת קובץ חדש</h2>

        {/* The drop zone is a convenience layered over the file input inside
            it, which stays fully keyboard-operable on its own. */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            takeFiles(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center",
            dragging ? "border-primary bg-primary-container/30" : "border-outline-variant",
          )}
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-container">
            <CloudUpload className="size-6 text-primary" />
          </span>
          <p className="text-sm font-medium">גרירת קובץ לכאן</p>
          <p className="text-xs text-on-surface-variant">או בחירת קובץ מהמחשב</p>
          <input
            ref={inputRef}
            id="file"
            name="file"
            type="file"
            data-testid="upload-file"
            accept={AD_ACCEPT_ATTRIBUTE}
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null);
              setFileSize(e.target.files?.[0]?.size ?? 0);
            }}
            className="mt-2 w-full text-xs file:me-3 file:rounded-sm file:border-0 file:bg-surface-container file:px-3 file:py-2 file:text-xs"
          />
          {fileName ? (
            <p className="text-xs text-on-surface" data-testid="chosen-file">
              <Ltr>{fileName}</Ltr>
            </p>
          ) : null}
        </div>

        {/* The requirements card — component kept, content replaced. */}
        <div
          data-testid="requirements-card"
          className="mt-4 flex gap-3 rounded-lg bg-status-info-bg p-3 text-status-info-fg"
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          <div className="text-xs">
            <p className="mb-1 font-semibold">דרישות קובץ</p>
            <p>פורמטים נתמכים: PDF, JPG, PNG</p>
            {shown ? (
              <p data-testid="max-size-note">
                גודל מקסימלי: <Ltr className="font-mono">{formatBytes(shown.maxAdFileSize)}</Ltr>
                {chosen ? ` (${chosen.name})` : ` — לפי ${shown.name}, המחמיר מבין העיתונים`}
              </p>
            ) : (
              <p>אין עדיין עיתון מוגדר בעסק, ולכן אין מגבלת גודל</p>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="newspaperId">
              עיתון יעד
            </label>
            <select
              id="newspaperId"
              name="newspaperId"
              data-testid="upload-newspaper"
              value={newspaperId}
              onChange={(e) => setNewspaperId(e.target.value)}
              className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
            >
              <option value="">ללא עיתון מסוים</option>
              {newspapers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="customerId">
              שיוך ללקוח
            </label>
            <Combobox
              id="customerId"
              name="customerId"
              testId="upload-customer"
              options={customers.map((c) => ({ value: c.id, label: c.label, hint: c.hint }))}
              placeholder="חיפוש לקוח…"
            />
            <p className="mt-1 text-xs text-on-surface-variant">
              מודעה ללא לקוח נשמרת, אך אינה זמינה לשיבוץ.
            </p>
          </div>
        </div>

        {tooBig ? (
          <div className="mt-3" data-testid="upload-too-big">
            <InlineError>{tooBig}</InlineError>
          </div>
        ) : state.message ? (
          <div className="mt-3">
            <InlineError>{state.message}</InlineError>
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <Button type="submit" disabled={pending || Boolean(tooBig)} data-testid="submit-upload">
            {pending ? "מעלה ובודק…" : "העלאה ובדיקה"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            ביטול
          </Button>
        </div>
      </form>
    </>
  );
}
