"use client";

import { useState } from "react";
import { publicationsPhrase } from "@/lib/domain/hebrew-count";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, Expand, FileText, ImageIcon, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { AD_FILE_TYPE_LABELS, formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { cn } from "@/lib/utils";

/**
 * Looking at a file, anywhere it is named.
 *
 * A file name is not a file. "cocacola_final_v2.pdf" and "cocacola_final_v3.pdf"
 * are the same string to a person scanning a table, and the only way to tell
 * them apart used to be opening the ad's own page and coming back — which is
 * exactly the trip that makes people stop checking.
 *
 * Everything the dialog shows is passed in as props. No fetch: every screen
 * that names a file already has these fields, and a lookup per row would turn
 * a table of forty into forty requests.
 */

export type AdPreviewModel = {
  id: string;
  name: string;
  fileType: AdFileType;
  fileSize: number;
  /** MinIO key, or null when no preview could be rendered. Never a public URL. */
  previewUrl: string | null;
  /** MinIO key of the live file, for the download link. */
  fileUrl?: string | null;
  customerLabel?: string | null;
  uploadedBy?: string | null;
  uploadedAt?: Date | null;
  publicationCount?: number;
  invalid?: boolean;
};

/** Files are only ever reached through the guarded route (conventions.md §5). */
export const fileHref = (key: string) => `/api/files/${key}`;

const DATE = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});

/** The small square: the rendered preview, or the icon that stands in for it. */
export function AdThumb({
  ad,
  className,
}: {
  ad: Pick<AdPreviewModel, "name" | "fileType" | "previewUrl">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-sm bg-surface-container",
        className,
      )}
    >
      {ad.previewUrl ? (
        /* next/image cannot be used: the src 307s to a short-lived signed URL,
           and the optimiser would cache that URL under its own key — exactly
           what conventions.md §5 forbids. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fileHref(ad.previewUrl)}
          alt=""
          className="size-full object-cover"
          loading="lazy"
        />
      ) : ad.fileType === "pdf" ? (
        <FileText className="size-1/2 text-primary" />
      ) : (
        <ImageIcon className="size-1/2 text-on-surface-variant" />
      )}
    </span>
  );
}

/**
 * The full-size look, in a dialog.
 *
 * `trigger` is whatever the host screen already renders — a thumbnail, a file
 * name, a magnifier — so the same dialog serves a table row, a card and the
 * picker without any of them agreeing on how it should be opened.
 */
export function AdPreviewDialog({
  ad,
  trigger,
  testId,
}: {
  ad: AdPreviewModel;
  trigger: React.ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/50" />
        <DialogPrimitive.Content
          data-testid={testId ?? `ad-preview-dialog-${ad.id}`}
          // Centred with inset-x-0 + mx-auto rather than a translate, so it
          // lands in the middle in both directions with no RTL special case.
          className="fixed inset-x-0 top-1/2 z-50 mx-auto flex max-h-[90vh] w-[min(56rem,calc(100vw-2rem))] -translate-y-1/2 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-2"
        >
          <div className="flex items-start justify-between gap-3 border-b border-outline-variant p-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="truncate font-serif text-lg font-semibold">
                {ad.name}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
                <Ltr className="font-mono">
                  {AD_FILE_TYPE_LABELS[ad.fileType]} · {formatBytes(ad.fileSize)}
                </Ltr>
                {ad.customerLabel ? <span>· {ad.customerLabel}</span> : null}
                {ad.uploadedAt ? (
                  <span>
                    · {ad.uploadedBy ? `${ad.uploadedBy}, ` : ""}
                    <Ltr>{DATE.format(ad.uploadedAt)}</Ltr>
                  </span>
                ) : null}
                {ad.publicationCount ? (
                  <span>· בשימוש ב־{publicationsPhrase(ad.publicationCount)}</span>
                ) : null}
                {ad.invalid ? <Badge tone="error">דורש טיפול</Badge> : null}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="sm" aria-label="סגירה">
                <X className="size-4" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-surface-container p-4">
            {ad.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fileHref(ad.previewUrl)}
                alt={ad.name}
                data-testid="ad-preview-image"
                className="max-h-[60vh] max-w-full object-contain"
              />
            ) : (
              <p className="flex flex-col items-center gap-2 text-sm text-on-surface-variant">
                <FileText className="size-12" />
                אין תצוגה מקדימה לקובץ הזה — אפשר להוריד אותו
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-outline-variant p-4">
            {ad.fileUrl ? (
              <Button variant="secondary" size="sm" asChild>
                <a
                  href={fileHref(ad.fileUrl)}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="ad-preview-download"
                >
                  <Download className="size-4" />
                  פתיחת הקובץ המלא
                </a>
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/advertisements/${ad.id}`} data-testid="ad-preview-open">
                לכרטיס המודעה
              </Link>
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * A magnifier that opens the dialog.
 *
 * Where the whole tile is a link to the ad's page, place this as a SIBLING of
 * the link and position it over the corner — not inside it. Nesting it would
 * need `preventDefault()` to stop the navigation, and `preventDefault()` is
 * exactly what tells Radix's trigger not to open: the dialog would never
 * appear, and the failure looks like a missing element rather than a fight
 * between two click handlers.
 */
export function AdQuickLook({ ad }: { ad: AdPreviewModel }) {
  return (
    <AdPreviewDialog
      ad={ad}
      trigger={
        <button
          type="button"
          aria-label={`תצוגה מקדימה של ${ad.name}`}
          data-testid={`quick-look-${ad.id}`}
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-surface-container-lowest/90 p-1.5 text-on-surface-variant shadow-elevation-1 hover:bg-surface-container-high"
        >
          <Expand className="size-4" />
        </button>
      }
    />
  );
}
