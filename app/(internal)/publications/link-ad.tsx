"use client";

import { FilePick } from "@/components/ui/file-pick";
import { useState, useTransition } from "react";
import { useFormActionState } from "@/components/use-form-action-state";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Link2, Link2Off, Replace, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { AD_ACCEPT_ATTRIBUTE, formatBytes } from "@/lib/domain/ad-file";
import {
  linkAdToPublicationAction,
  unlinkAdFromPublicationAction,
  uploadAdvertisementAction,
  type AdFormState,
} from "../advertisements/actions";

import { AdPicker } from "@/components/ads/ad-picker";
import { AdPreviewDialog, AdThumb, type AdPreviewModel } from "@/components/ads/ad-preview";

/** Everything the picker needs to tell two similar file names apart. */
export type AdOption = AdPreviewModel;

/**
 * Artwork, from the PUBLICATION side.
 *
 * Three ways in, because the work arrives all three ways: the file is already
 * in the library and needs pointing at a date; the customer just emailed it and
 * the person is looking straight at the date it belongs to; or a replacement
 * arrived for something already attached.
 *
 * The upload form carries no customer and no newspaper field on purpose — the
 * publication answers both, and the server takes them from it rather than from
 * anything the browser sent.
 */
export function LinkAdCell({
  publicationId,
  linked,
  options,
  limit,
}: {
  publicationId: string;
  linked: AdPreviewModel | null;
  options: AdOption[];
  /** The publication's own newspaper ceiling, shown before a file is chosen. */
  limit: { newspaperName: string; maxBytes: number };
}) {
  const [mode, setMode] = useState<"idle" | "upload">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const run = (fn: () => Promise<AdFormState>) => {
    setError(null);
    start(async () => {
      const result = await fn();
      if (result?.message) setError(result.message);
      else {
        setMode("idle");
        router.refresh();
      }
    });
  };

  const [uploadState, uploadAction, uploading, keepTypedOnError] = useFormActionState<
    AdFormState,
    FormData
  >(async (prev, formData) => {
    const next = await uploadAdvertisementAction(prev, formData);
    if (next.ok && !next.message) {
      setMode("idle");
      router.refresh();
    }
    return next;
  }, {});

  // Picking a file answers "no file chosen" — the red line goes at once
  // rather than staying until the next submit (the user, 03/11/2026).
  const [dismissed, setDismissed] = useState<AdFormState | null>(null);

  const uploadForm = (
    <form
      action={uploadAction}
      onReset={keepTypedOnError}
      data-testid={`row-upload-form-${publicationId}`}
    >
      {/* The only fields the server reads besides the file itself. */}
      <input type="hidden" name="publicationId" value={publicationId} />
      {linked ? <input type="hidden" name="replace" value="1" /> : null}

      <p className="mb-2 text-xs text-on-surface-variant">
        {linked
          ? "הקובץ החדש יחליף את המודעה המשויכת. הקובץ הקודם נשאר בספרייה."
          : "הקובץ ישויך ללקוח של הפרסום ויחובר אליו מיד."}
      </p>
      <FilePick
        testId={`row-upload-file-${publicationId}`}
        accept={AD_ACCEPT_ATTRIBUTE}
        onPicked={() => setDismissed(uploadState)}
      />
      <p className="mt-2 text-xs text-on-surface-variant">
        PDF, JPG, PNG · עד <Ltr className="font-mono">{formatBytes(limit.maxBytes)}</Ltr> (
        {limit.newspaperName})
      </p>
      {uploadState.message && dismissed !== uploadState ? (
        <div className="mt-2">
          <InlineError>{uploadState.message}</InlineError>
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={uploading}
          data-testid={`row-upload-submit-${publicationId}`}
        >
          {uploading ? "מעלה…" : linked ? "החלפה" : "העלאה ושיוך"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
          ביטול
        </Button>
      </div>
    </form>
  );

  // A small dialog, not a box absolutely positioned inside the row: the
  // table's `overflow-x-auto` clipped it, hiding half the "החלפה" button and
  // scrolling the table sideways (habodek, 08/11/2026).
  const uploadDialog = (
    <DialogPrimitive.Root
      open={mode === "upload"}
      onOpenChange={(next) => setMode(next ? "upload" : "idle")}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/30" />
        <DialogPrimitive.Content
          className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(24rem,calc(100vw-2rem))] -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-elevation-2"
          aria-describedby={undefined}
        >
          <div className="mb-2 flex items-start justify-between gap-2">
            <DialogPrimitive.Title className="font-serif text-lg font-semibold">
              {linked ? "החלפת המודעה" : "העלאה ושיוך"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="סגירה" className="rounded-sm p-1">
                <X className="size-4 text-on-surface-variant" />
              </button>
            </DialogPrimitive.Close>
          </div>
          {uploadForm}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );

  if (linked) {
    return (
      <div className="relative flex items-center gap-1">
        {/* The thumbnail IS the preview trigger: a file name is not a file,
            and two versions of the same artwork read identically in a table. */}
        <AdPreviewDialog
          ad={linked}
          trigger={
            <button
              type="button"
              aria-label={`תצוגה מקדימה של ${linked.name}`}
              data-testid={`row-linked-${publicationId}`}
              className="flex items-center gap-2 rounded-sm hover:bg-surface-container-low"
            >
              <AdThumb ad={linked} className="size-8 shrink-0" />
              <span className="max-w-20 truncate text-xs underline" title={linked.name}>
                {linked.name}
              </span>
            </button>
          }
        />

        {/* Replace, because the ordinary correction is "they sent a new
            version" rather than "remove it and leave the date empty". */}
        <Button
          variant="ghost"
          size="sm"
          data-testid={`row-replace-${publicationId}`}
          onClick={() => setMode((m) => (m === "upload" ? "idle" : "upload"))}
        >
          <Replace className="size-4" />
          <span className="sr-only">החלפת המודעה</span>
        </Button>

        {/*
          Detaching asks first. It looks like a small tidy-up and is not: the
          publication goes back to having no artwork, which puts it out of reach
          of the layout board and back onto the reminder list.
        */}
        <ConfirmDialog
          testId={`unlink-dialog-${publicationId}`}
          trigger={
            <Button variant="ghost" size="sm" data-testid={`row-unlink-${publicationId}`}>
              <Link2Off className="size-4" />
              <span className="sr-only">ביטול שיוך המודעה</span>
            </Button>
          }
          title="לבטל את שיוך המודעה?"
          body={
            <>
              <p className="mb-2">
                הקובץ <strong>{linked.name}</strong> יינתק מהפרסום הזה. הקובץ עצמו נשאר בספרייה
                ואינו נמחק.
              </p>
              <p>הפרסום יחזור למצב &quot;חסר קובץ&quot; ויופיע שוב ברשימת התזכורות.</p>
            </>
          }
          confirmLabel="ביטול השיוך"
          pendingLabel="מנתקת…"
          onConfirm={async () => {
            const result = await unlinkAdFromPublicationAction(publicationId);
            if (!result.message) router.refresh();
            return result;
          }}
        />

        {uploadDialog}
        {error ? <InlineError>{error}</InlineError> : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-1">
        <Button
          variant="primary"
          size="sm"
          data-testid={`row-upload-${publicationId}`}
          onClick={() => setMode((m) => (m === "upload" ? "idle" : "upload"))}
        >
          <Upload className="size-4" />
          העלאה
        </Button>
        {options.length > 0 ? (
          <AdPicker
            options={options}
            busy={busy}
            error={error}
            testId={`row-link-list-${publicationId}`}
            onSelect={(adId) => run(() => linkAdToPublicationAction(adId, publicationId))}
            trigger={
              <Button variant="secondary" size="sm" data-testid={`row-link-${publicationId}`}>
                <Link2 className="size-4" />
                מודעה קיימת
              </Button>
            }
          />
        ) : null}
      </div>

      {uploadDialog}

      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
