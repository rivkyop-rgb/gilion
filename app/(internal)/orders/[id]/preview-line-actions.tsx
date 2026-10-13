"use client";

import { useState, useTransition } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { removeOrderItemAction, updateOrderItemAction } from "../actions";

/**
 * Edit and delete, on the preview row itself (12/10/2026).
 *
 * The preview is where a person reads what approval will create, so it is
 * where a wrong date is noticed — sending them back up to the line builder to
 * find the same row in a grouped table was a hunt. Only the date and the price
 * are editable: the newspaper, page type and shape decide what the line IS,
 * and changing those is a delete and an add.
 */
export function PreviewLineActions({
  orderId,
  itemId,
  label,
  dateIso,
  price,
}: {
  orderId: string;
  itemId: string;
  /** "date · newspaper · shape" — what the dialogs name. */
  label: string;
  dateIso: string;
  price: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <Button
        size="sm"
        variant="ghost"
        data-testid={`edit-line-${itemId}`}
        aria-label={`עריכת ${label}`}
        onClick={() => setEditing(true)}
      >
        <Pencil className="size-4" />
        עריכה
      </Button>
      <ConfirmDialog
        testId={`delete-line-dialog-${itemId}`}
        trigger={
          <Button
            size="sm"
            variant="ghost"
            data-testid={`delete-line-${itemId}`}
            aria-label={`מחיקת ${label}`}
          >
            <Trash2 className="size-4" />
            מחיקה
          </Button>
        }
        title="למחוק את השורה?"
        body={<p>{label} יוסר מההזמנה, והסכום יחושב מחדש.</p>}
        confirmLabel="מחיקה"
        pendingLabel="מוחקת…"
        onConfirm={() => removeOrderItemAction(orderId, itemId)}
      />
      {editing ? (
        <EditLineDialog
          orderId={orderId}
          itemId={itemId}
          label={label}
          dateIso={dateIso}
          price={price}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </span>
  );
}

function EditLineDialog({
  orderId,
  itemId,
  label,
  dateIso,
  price,
  onClose,
}: {
  orderId: string;
  itemId: string;
  label: string;
  dateIso: string;
  price: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState(dateIso);
  const [amount, setAmount] = useState(price);
  const [special, setSpecial] = useState(false);
  const [askSpecial, setAskSpecial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await updateOrderItemAction(orderId, itemId, {
        date,
        price: amount,
        specialEdition: special,
      });
      if (result.ok) return onClose();
      // Off the schedule is a question, not a dead end: ask, and let them tick.
      if (result.errors?.specialEdition) {
        // The checkbox IS the message — saying it twice, once in red, made a
        // question read like a failure.
        setAskSpecial(true);
        setError(null);
        return;
      }
      setError(result.message ?? "השמירה נכשלה");
    });

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid={`edit-line-dialog-${itemId}`}
          className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(26rem,calc(100vw-2rem))] -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-2"
        >
          <DialogPrimitive.Title className="mb-1 font-serif text-lg font-semibold">
            עריכת שורה
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 text-sm text-on-surface-variant">
            {label}
          </DialogPrimitive.Description>

          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`edit-date-${itemId}`}>תאריך פרסום</Label>
              <Input
                id={`edit-date-${itemId}`}
                type="date"
                value={date}
                data-testid="edit-line-date"
                onChange={(e) => {
                  setDate(e.target.value);
                  setSpecial(false);
                  setAskSpecial(false);
                }}
              />
            </div>
            <div>
              <Label htmlFor={`edit-price-${itemId}`}>מחיר (₪)</Label>
              <Input
                id={`edit-price-${itemId}`}
                inputMode="decimal"
                dir="ltr"
                value={amount}
                data-testid="edit-line-price"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          {askSpecial ? (
            <label className="mb-3 flex items-center gap-2 rounded-lg bg-status-warning-bg p-2 text-sm text-status-warning-fg">
              <input
                type="checkbox"
                checked={special}
                data-testid="edit-line-special"
                onChange={(e) => setSpecial(e.target.checked)}
              />
              <span>
                התאריך <Ltr>{date.split("-").reverse().join(".")}</Ltr> אינו יום הדפסה של העיתון —
                זו מהדורה מיוחדת
              </span>
            </label>
          ) : null}

          {error ? <InlineError>{error}</InlineError> : null}

          <div className="mt-2 flex gap-3 border-t border-outline-variant pt-4">
            <Button onClick={save} disabled={pending} data-testid="edit-line-save">
              {pending ? "שומרת…" : "שמירה"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
