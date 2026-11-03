"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Replace, Upload } from "lucide-react";

import { AdThumb } from "@/components/ads/ad-preview";
import { Button } from "@/components/ui/button";
import { FilePick } from "@/components/ui/file-pick";
import { InlineError } from "@/components/states";
import { useFormActionState } from "@/components/use-form-action-state";
import { AD_ACCEPT_ATTRIBUTE, type AdFileType } from "@/lib/domain/ad-file";
import { uploadAdvertisementAction, type AdFormState } from "../../advertisements/actions";

type FileRef = { id: string; name: string; fileType: AdFileType; previewUrl: string | null };

/**
 * The file of ONE date in the preview, before approval — shown, and changed
 * right there (the user, 03/11/2026: "לערוך ולשנות את הקובץ גם בתצוגה מקדימה").
 *
 * A date with no file of its own shows the order's file, marked as such: that
 * is the one approval will attach. Changing it uploads a file for this date
 * only — the order's file stays for the others.
 */
export function ItemFileCell({
  orderId,
  itemId,
  own,
  fromOrder,
  editable,
}: {
  orderId: string;
  itemId: string;
  own: FileRef | null;
  fromOrder: FileRef | null;
  editable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<AdFormState | null>(null);
  const [state, action, pending, keepTypedOnError] = useFormActionState<AdFormState, FormData>(
    async (prev, formData) => {
      const next = await uploadAdvertisementAction(prev, formData);
      if (next.ok && !next.message) {
        setOpen(false);
        router.refresh();
      }
      return next;
    },
    {},
  );
  const shown = own ?? fromOrder;

  return (
    <div className="relative flex items-center gap-2" data-testid={`item-file-${itemId}`}>
      {shown ? (
        <>
          <AdThumb ad={shown} className="size-10 shrink-0" />
          <span className="min-w-0">
            <span className="block max-w-36 truncate text-xs" title={shown.name}>
              {shown.name}
            </span>
            {!own ? (
              <span className="block text-[11px] text-on-surface-variant">הקובץ של ההזמנה</span>
            ) : null}
          </span>
        </>
      ) : (
        <span className="rounded-full bg-status-warning-bg px-2 py-0.5 text-[11px] text-status-warning-fg">
          עדיין בלי קובץ
        </span>
      )}

      {editable ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={shown ? "קובץ אחר לתאריך הזה" : "העלאת קובץ לתאריך הזה"}
          data-testid={`item-file-change-${itemId}`}
          onClick={() => setOpen((o) => !o)}
        >
          {shown ? <Replace className="size-4" /> : <Upload className="size-4" />}
          {shown ? "החלפה" : "העלאה"}
        </Button>
      ) : null}

      {open ? (
        <form
          action={action}
          onReset={keepTypedOnError}
          className="absolute end-0 top-full z-20 mt-1 w-72 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 shadow-elevation-2"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="scope" value="some" />
          <input type="hidden" name="lineIds" value={itemId} />
          <p className="mb-2 text-xs text-on-surface-variant">
            הקובץ ישויך לתאריך הזה בלבד. שאר התאריכים נשארים עם הקובץ שלהם.
          </p>
          <FilePick
            testId={`item-file-input-${itemId}`}
            accept={AD_ACCEPT_ATTRIBUTE}
            onPicked={() => setDismissed(state)}
          />
          {state.message && dismissed !== state ? (
            <div className="mt-2">
              <InlineError>{state.message}</InlineError>
            </div>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button type="submit" size="sm" disabled={pending} data-testid={`item-file-submit-${itemId}`}>
              {pending ? "מעלה…" : "שמירה"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              ביטול
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
