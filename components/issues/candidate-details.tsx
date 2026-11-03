"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Replace, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FilePick } from "@/components/ui/file-pick";
import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { useFormActionState } from "@/components/use-form-action-state";
import { AD_ACCEPT_ATTRIBUTE } from "@/lib/domain/ad-file";
import { describePosition } from "@/lib/domain/position-request";
import { ItemPositionEditor } from "@/app/(internal)/orders/[id]/position-fields";
import {
  uploadAdvertisementAction,
  type AdFormState,
} from "@/app/(internal)/advertisements/actions";
import { changePublicationShapeAction } from "@/app/(internal)/issues/actions";
import type { CandidateDetails } from "./unplaced-panel";

const MONEY = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });
const orderRef = (n: number) => `ORD-${String(n).padStart(4, "0")}`;

/**
 * Everything about one ad waiting on the board, opened by its arrow — and the
 * three things that can be changed without leaving the board: where it asks to
 * be, its size (the price follows the price list) and its file (the user,
 * 03/11/2026).
 */
export function CandidateDetailsPanel({
  issueId,
  publicationId,
  shapeId,
  details,
  editable,
  manualOnly,
}: {
  issueId: string;
  publicationId: string;
  shapeId: string;
  details: CandidateDetails;
  editable: boolean;
  manualOnly: boolean;
}) {
  const router = useRouter();
  const [nextShape, setNextShape] = useState(shapeId);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const chosen = details.shapeOptions.find((s) => s.id === nextShape);

  return (
    <div
      data-testid={`candidate-details-${publicationId}`}
      className="mt-1 space-y-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-2 text-xs"
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
        <dt className="text-on-surface-variant">הזמנה</dt>
        <dd>
          <Link
            href={`/orders/${details.orderId}`}
            target="_blank"
            className="inline-flex items-center gap-1 underline"
          >
            <Ltr>{orderRef(details.orderNumber)}</Ltr>
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        </dd>
        <dt className="text-on-surface-variant">מחיר</dt>
        <dd>
          <Ltr>{MONEY.format(details.price)}</Ltr>
        </dd>
        <dt className="text-on-surface-variant">מיקום</dt>
        <dd>{describePosition(details.position) ?? "בלי בקשה"}</dd>
        {details.position.note ? (
          <>
            <dt className="text-on-surface-variant">הערה</dt>
            <dd className="font-medium">{details.position.note}</dd>
          </>
        ) : null}
        {manualOnly ? (
          <>
            <dt className="text-on-surface-variant">שיבוץ</dt>
            <dd>ביד בלבד — השיבוץ האוטומטי מדלג על הלקוח הזה</dd>
          </>
        ) : null}
      </dl>

      {editable && !details.placed ? (
        <div className="space-y-2 border-t border-outline-variant pt-2">
          {details.orderItemId ? (
            <div className="flex items-center gap-2">
              <span className="text-on-surface-variant">שינוי מיקום:</span>
              <ItemPositionEditor
                orderId={details.orderId}
                itemId={details.orderItemId}
                initial={details.position}
              />
            </div>
          ) : null}

          {details.shapeOptions.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-on-surface-variant" htmlFor={`shape-${publicationId}`}>
                גודל:
              </label>
              <select
                id={`shape-${publicationId}`}
                value={nextShape}
                onChange={(e) => setNextShape(e.target.value)}
                className="h-8 rounded-md border border-outline-variant bg-surface-container px-2"
                data-testid={`candidate-shape-${publicationId}`}
              >
                {details.shapeOptions.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.price === null}>
                    {s.name}
                    {s.price === null ? " (אין מחיר)" : ` · ${MONEY.format(s.price)}`}
                  </option>
                ))}
              </select>
              {nextShape !== shapeId ? (
                <Button
                  size="sm"
                  className="h-8"
                  disabled={busy || !chosen || chosen.price === null}
                  data-testid={`candidate-shape-save-${publicationId}`}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await changePublicationShapeAction(
                        issueId,
                        publicationId,
                        nextShape,
                      );
                      setNote({ text: result.message ?? "", ok: Boolean(result.ok) });
                      if (result.ok) router.refresh();
                    })
                  }
                >
                  שינוי גודל (המחיר יתעדכן)
                </Button>
              ) : null}
            </div>
          ) : null}

          {uploading ? (
            <FileForm
              publicationId={publicationId}
              replace={details.hasAd}
              onDone={(text) => {
                setUploading(false);
                setNote({ text, ok: true });
                router.refresh();
              }}
              onCancel={() => setUploading(false)}
            />
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="h-8"
              data-testid={`candidate-file-${publicationId}`}
              onClick={() => setUploading(true)}
            >
              {details.hasAd ? <Replace className="size-4" /> : <Upload className="size-4" />}
              {details.hasAd ? "החלפת קובץ" : "העלאת קובץ"}
            </Button>
          )}
        </div>
      ) : details.placed ? (
        <p className="border-t border-outline-variant pt-2 text-on-surface-variant">
          המודעה כבר על עמוד. כדי לשנות גודל — להוריד אותה מהעמוד קודם.
        </p>
      ) : null}

      {note?.text ? (
        <p
          role="status"
          className={note.ok ? "text-status-success-fg" : "text-status-error-fg"}
          data-testid={`candidate-note-${publicationId}`}
        >
          {note.text}
        </p>
      ) : null}
    </div>
  );
}

function FileForm({
  publicationId,
  replace,
  onDone,
  onCancel,
}: {
  publicationId: string;
  replace: boolean;
  onDone: (text: string) => void;
  onCancel: () => void;
}) {
  const [dismissed, setDismissed] = useState<AdFormState | null>(null);
  const [state, action, pending, keepTypedOnError] = useFormActionState<AdFormState, FormData>(
    async (prev, formData) => {
      const next = await uploadAdvertisementAction(prev, formData);
      if (next.ok && !next.message) onDone(replace ? "הקובץ הוחלף" : "הקובץ הועלה ושויך");
      return next;
    },
    {},
  );
  return (
    <form action={action} onReset={keepTypedOnError} className="space-y-2">
      <input type="hidden" name="publicationId" value={publicationId} />
      {replace ? <input type="hidden" name="replace" value="1" /> : null}
      <FilePick
        testId={`candidate-file-input-${publicationId}`}
        accept={AD_ACCEPT_ATTRIBUTE}
        onPicked={() => setDismissed(state)}
      />
      {state.message && dismissed !== state ? <InlineError>{state.message}</InlineError> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="h-8" disabled={pending}>
          {pending ? "מעלה…" : "שמירה"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  );
}
