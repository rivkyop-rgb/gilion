"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileCheck2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { AD_ACCEPT_ATTRIBUTE, formatBytes } from "@/lib/domain/ad-file";
import { uploadAdvertisementAction, type AdFormState } from "../../advertisements/actions";

/**
 * Artwork attached to the ORDER, before there are any publications.
 *
 * The common case in this business is one advertisement for every date: the
 * customer sends a single file and asks for it to run five times. Until the
 * order is approved there is no publication to attach it to, so the file waits
 * on the order and approval hands it to every publication it creates.
 *
 * No customer field and no newspaper field: the order settles the customer,
 * and the size limit is the strictest among the newspapers the order's own
 * lines use — anything looser would accept a file one of those lines could
 * never print.
 */
export function OrderArtwork({
  orderId,
  attached,
  limit,
  lineCount,
  approved,
  missingCount,
}: {
  orderId: string;
  attached: { id: string; name: string } | null;
  limit: { newspaperName: string; maxBytes: number } | null;
  lineCount: number;
  /** After approval the publications exist, so the file goes to them directly. */
  approved: boolean;
  /** How many publications still have no artwork. Zero hides the control. */
  missingCount: number;
}) {
  const router = useRouter();

  const [state, formAction, pending] = useActionState<AdFormState, FormData>(
    async (prev, formData) => {
      const next = await uploadAdvertisementAction(prev, formData);
      if (next.ok && !next.message) router.refresh();
      return next;
    },
    {},
  );

  // After approval the only question is whether any date is still uncovered.
  // A form offering to cover nothing is worse than no form: it invites an
  // upload that would land on no publication at all. Whether a file happens to
  // be recorded on the order is irrelevant by then — each publication carries
  // its own, and that is the finer and truer answer.
  if (approved) {
    if (missingCount === 0) return null;
  } else if (attached) {
    return (
      <div
        data-testid="order-artwork-attached"
        className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4"
      >
        <FileCheck2 className="size-5 text-status-success-fg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">מודעה מצורפת להזמנה</p>
          <Link
            href={`/advertisements/${attached.id}`}
            className="truncate text-xs underline"
            title={attached.name}
          >
            {attached.name}
          </Link>
        </div>
        <p className="text-xs text-on-surface-variant">
          תשויך ל־{lineCount} הפרסומים שייווצרו באישור. אפשר להחליף בכל פרסום בנפרד אחר כך.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      data-testid="order-artwork-form"
      className="mb-8 rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-4"
    >
      <input type="hidden" name="orderId" value={orderId} />

      <p className="mb-1 flex items-center gap-2 text-sm font-medium">
        <Upload className="size-4" />
        {approved ? `מודעה ל־${missingCount} הפרסומים שעדיין בלי קובץ` : "מודעה להזמנה כולה"}
      </p>
      <p className="mb-3 text-xs text-on-surface-variant">
        {approved
          ? "הקובץ ישויך לכל פרסום בהזמנה שעדיין אין לו מודעה. פרסום שכבר יש לו קובץ לא ייגע."
          : "אם הלקוח שלח מודעה אחת לכל התאריכים — אפשר להעלות אותה כאן, והיא תשויך אוטומטית לכל הפרסומים באישור ההזמנה."}
        {limit ? (
          <>
            {" "}
            PDF, JPG, PNG · עד <Ltr className="font-mono">{formatBytes(limit.maxBytes)}</Ltr> (
            {limit.newspaperName} — המחמיר מבין העיתונים בהזמנה)
          </>
        ) : null}
      </p>

      <input
        type="file"
        name="file"
        data-testid="order-artwork-file"
        accept={AD_ACCEPT_ATTRIBUTE}
        className="w-full max-w-md text-xs file:me-3 file:rounded-sm file:border-0 file:bg-surface-container file:px-3 file:py-2 file:text-xs"
      />

      {state.message ? (
        <div className="mt-2 max-w-md">
          <InlineError>{state.message}</InlineError>
        </div>
      ) : null}

      <div className="mt-3">
        <Button type="submit" size="sm" disabled={pending} data-testid="order-artwork-submit">
          {pending ? "מעלה…" : "העלאה וצירוף להזמנה"}
        </Button>
      </div>
    </form>
  );
}
