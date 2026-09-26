import Link from "next/link";
import { publicationsPhrase } from "@/lib/domain/hebrew-count";
import { AlertTriangle, FileText, ImageIcon, UserX } from "lucide-react";

import { AdQuickLook } from "@/components/ads/ad-preview";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ui/ltr";
import { AD_FILE_TYPE_LABELS, formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { cn } from "@/lib/utils";
import { initials, relativeTime } from "./format";

export type AdCardModel = {
  id: string;
  name: string;
  fileType: AdFileType;
  fileSize: number;
  previewUrl: string | null;
  /** The live file, for the "open the full file" link in the preview. */
  fileUrl: string;
  status: "valid" | "invalid" | "archived";
  validationStatus: "pending" | "passed" | "failed";
  validationError: string | null;
  customerLabel: string | null;
  /** For the list view, where the name links to the customer. The card itself is a link and cannot nest one. */
  customerId?: string | null;
  uploadedBy: string;
  uploadedAt: Date;
  publicationCount: number;
};

/** The preview goes through the guarded route — never an object URL (§5). */
export const fileHref = (key: string) => `/api/files/${key}`;

/**
 * One file in the library (docs/design/screens/05-file-management.md).
 *
 * Three things the design did not have, and US-005 requires: the "ללא לקוח"
 * badge with its explanation (AC-4), a real validation_error in the red banner
 * instead of an invented dpi complaint, and the count of publications using
 * the file — one ad may serve several (rule 6).
 */
export function AdCard({ ad }: { ad: AdCardModel }) {
  const failed = ad.validationStatus === "failed";
  const pending = ad.validationStatus === "pending";

  const preview = {
    id: ad.id,
    name: ad.name,
    fileType: ad.fileType,
    fileSize: ad.fileSize,
    previewUrl: ad.previewUrl,
    fileUrl: ad.fileUrl,
    customerLabel: ad.customerLabel,
    uploadedBy: ad.uploadedBy,
    uploadedAt: ad.uploadedAt,
    publicationCount: ad.publicationCount,
    invalid: failed,
  };

  return (
    <div className="relative">
      {/* Looking without leaving. A sibling of the link, never inside it. */}
      <span className="absolute top-2 start-2 z-10">
        <AdQuickLook ad={preview} />
      </span>

      <Link
        href={`/advertisements/${ad.id}`}
        data-testid={`ad-card-${ad.id}`}
        className={cn(
          "group flex flex-col overflow-hidden rounded-lg border bg-surface-container-lowest transition-colors",
          // RTL: border-s is the start edge — the right in Hebrew, which is where
          // the design's coloured rule sits.
          failed
            ? "border-status-error-fg/40 border-s-4 border-s-status-error-fg"
            : "border-outline-variant hover:bg-surface-container-low",
        )}
      >
        <div className="relative flex h-40 items-center justify-center bg-surface-container">
          {ad.previewUrl ? (
            /* next/image is not usable here: the src is a route that 307s to a
             short-lived presigned URL, and the optimiser would cache that URL
             under its own key — exactly what conventions.md §5 forbids. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fileHref(ad.previewUrl)}
              alt=""
              className="h-full w-full object-contain"
              loading="lazy"
            />
          ) : ad.fileType === "pdf" ? (
            <FileText className={cn("size-10", failed ? "text-status-error-fg" : "text-primary")} />
          ) : (
            <ImageIcon className="size-10 text-on-surface-variant" />
          )}

          <div className="absolute top-2 end-2">
            {failed ? (
              <Badge tone="error" data-testid="ad-badge-invalid">
                <AlertTriangle className="size-3" />
                דורש טיפול
              </Badge>
            ) : pending ? (
              <Badge tone="warning">בבדיקה…</Badge>
            ) : ad.status === "archived" ? (
              <Badge tone="muted">בארכיון</Badge>
            ) : (
              <Badge tone="success">תקין</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-3">
          <p className="truncate text-sm font-medium text-on-surface" title={ad.name}>
            {ad.name}
          </p>

          {ad.customerLabel ? (
            <p className="truncate text-xs text-on-surface-variant">לקוח: {ad.customerLabel}</p>
          ) : (
            <Badge tone="warning" data-testid={`ad-no-customer-${ad.id}`}>
              <UserX className="size-3" />
              ללא לקוח — לא זמינה לשיבוץ
            </Badge>
          )}

          <p className="font-mono text-xs text-on-surface-variant">
            <Ltr>
              {AD_FILE_TYPE_LABELS[ad.fileType]} · {formatBytes(ad.fileSize)}
            </Ltr>
          </p>

          {failed && ad.validationError ? (
            <p
              data-testid={`ad-error-${ad.id}`}
              className="flex items-start gap-2 rounded-sm bg-status-error-bg px-2 py-1.5 text-xs text-status-error-fg"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {ad.validationError}
            </p>
          ) : null}

          {ad.publicationCount > 0 ? (
            <p className="text-xs text-on-surface-variant">
              משמשת ב־{publicationsPhrase(ad.publicationCount)}
            </p>
          ) : null}

          <div className="mt-auto flex items-center gap-2 border-t border-outline-variant pt-2 text-xs text-on-surface-variant">
            <span className="flex size-6 items-center justify-center rounded-full bg-surface-container text-[10px] font-semibold">
              {initials(ad.uploadedBy)}
            </span>
            <span className="truncate">{ad.uploadedBy}</span>
            <span className="ms-auto shrink-0">{relativeTime(ad.uploadedAt)}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
