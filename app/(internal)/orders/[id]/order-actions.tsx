"use client";

import { useActionState, useState, useTransition } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Check, Ban, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Ltr } from "@/components/ui/ltr";
import { canDeleteOrder, type OrderStatus } from "@/lib/domain/order-status";
import {
  approveOrderAction,
  cancelOrderAction,
  completeOrderAction,
  deleteOrderAction,
  rejectOrderAction,
  submitOrderAction,
  type FormState,
} from "../actions";

/**
 * The action bar. Which buttons appear is driven by the order's status, and the
 * server refuses anything the machine disallows regardless of what is rendered.
 */
export function OrderActions({
  orderId,
  orderRef,
  status,
  canApprove,
  canComplete,
  publicationCount,
  lineCount,
  total,
  layout = "bar",
  directApproval = false,
  missingAd = false,
  soonDate = null,
}: {
  orderId: string;
  orderRef: string;
  status: OrderStatus;
  canApprove: boolean;
  canComplete: boolean;
  publicationCount: number;
  lineCount: number;
  total: string;
  /**
   * `bar` — the sticky strip along the bottom of the page. `card` — stacked,
   * full width, inside the order summary card (design 03).
   */
  layout?: "bar" | "card";
  /**
   * The business approves office orders straight from the draft
   * (Business.internal_orders_need_approval = false) and this order was typed
   * in the office. Then the draft offers "אישור" instead of "שליחה לאישור".
   */
  directApproval?: boolean;
  /** No artwork attached to the order or to any of its lines. */
  missingAd?: boolean;
  /** The earliest line date, formatted, when it falls in the coming week. */
  soonDate?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);

  const run = (fn: () => Promise<FormState>) =>
    startTransition(async () => setError((await fn()).message ?? null));

  /**
   * Moving an order forward without its artwork asks first — and if the paper
   * prints within the week, asks again, separately (the user's rule): two
   * different warnings, each confirmed on its own, never one dialog carrying
   * both where the second sentence is read past.
   */
  const [warning, setWarning] = useState<{ step: "no-ad" | "soon"; go: () => void } | null>(null);
  const guarded = (fn: () => Promise<FormState>) => () => {
    const go = () => {
      setWarning(null);
      run(fn);
    };
    if (!missingAd) return go();
    setWarning({ step: "no-ad", go });
  };

  return (
    <div
      className={
        layout === "bar"
          ? "sticky bottom-0 -mx-4 mt-8 border-t border-outline-variant bg-surface-container-lowest px-4 py-4 lg:-mx-8 lg:px-8"
          : ""
      }
    >
      {error ? <InlineError>{error}</InlineError> : null}

      {rejecting ? (
        <RejectForm orderId={orderId} onCancel={() => setRejecting(false)} />
      ) : (
        <div className={layout === "bar" ? "flex flex-wrap gap-3" : "flex flex-col gap-2"}>
          {status === "draft" && directApproval && canApprove ? (
            <Button
              disabled={busy}
              data-testid="approve-order"
              onClick={guarded(() => approveOrderAction(orderId))}
            >
              <Check className="size-4" />
              אישור ההזמנה
            </Button>
          ) : status === "draft" ? (
            <Button
              disabled={busy}
              data-testid="submit-order"
              onClick={guarded(() => submitOrderAction(orderId))}
            >
              שליחה לאישור
            </Button>
          ) : null}

          {status === "pending_approval" && canApprove ? (
            <>
              <Button
                disabled={busy}
                data-testid="approve-order"
                onClick={guarded(() => approveOrderAction(orderId))}
              >
                <Check className="size-4" />
                אישור ההזמנה
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                data-testid="open-reject"
                onClick={() => setRejecting(true)}
              >
                <X className="size-4" />
                דחייה
              </Button>
            </>
          ) : null}

          {status === "approved" && canComplete ? (
            <span className={layout === "bar" ? "flex items-center gap-2" : "flex flex-col gap-2"}>
              <Button
                variant="secondary"
                disabled={busy}
                data-testid="complete-order"
                onClick={() => run(() => completeOrderAction(orderId))}
              >
                סימון כהושלמה
              </Button>
              {/*
                "Completed" was a word with no explanation next to it, and the
                question it raises — does this change anything for the
                customer? — has a real answer: it closes the order for good.
              */}
              <span className="text-xs text-on-surface-variant" data-testid="complete-hint">
                סגירה סופית: כל הפרסומים כבר רצו או בוטלו, ומכאן ההזמנה היסטוריה — אי אפשר לשנות
                אותה ואי אפשר לבטל אותה.
              </span>
            </span>
          ) : null}

          {status !== "completed" && status !== "canceled" ? (
            <Button
              variant="ghost"
              disabled={busy}
              data-testid="cancel-order"
              onClick={() => run(() => cancelOrderAction(orderId))}
            >
              <Ban className="size-4" />
              ביטול ההזמנה
            </Button>
          ) : null}

          {/*
            Deletion is offered only where it is honest — nothing binding has
            come out of the order yet. Everywhere else the button is absent
            rather than disabled, because a disabled delete invites a hunt for
            the way to enable it; cancelling is the answer, and it is right
            there next to it.
          */}
          {canDeleteOrder(status, publicationCount) ? (
            <ConfirmDialog
              testId="delete-order-dialog"
              trigger={
                <Button variant="ghost" disabled={busy} data-testid="delete-order">
                  <Trash2 className="size-4" />
                  מחיקת ההזמנה
                </Button>
              }
              title="למחוק את ההזמנה?"
              body={
                <>
                  <p className="mb-2">
                    הזמנה <Ltr>{orderRef}</Ltr> תימחק לצמיתות, יחד עם {lineCount} השורות שלה בסכום{" "}
                    <Ltr>{total}</Ltr>. אי אפשר לשחזר.
                  </p>
                  <p>
                    אם ההזמנה רק לא יצאה לפועל — <strong>ביטול</strong> עדיף: הוא משאיר אותה
                    בהיסטוריה ובדוחות.
                  </p>
                </>
              }
              confirmLabel="מחיקה לצמיתות"
              pendingLabel="מוחקת…"
              onConfirm={() => deleteOrderAction(orderId)}
            />
          ) : null}
        </div>
      )}
      {warning ? (
        <OrderWarning
          step={warning.step}
          soonDate={soonDate}
          onCancel={() => setWarning(null)}
          onConfirm={() => {
            if (warning.step === "no-ad" && soonDate) {
              setWarning({ step: "soon", go: warning.go });
            } else {
              warning.go();
            }
          }}
        />
      ) : null}
    </div>
  );
}

/** One warning at a time — see `guarded`. */
function OrderWarning({
  step,
  soonDate,
  onCancel,
  onConfirm,
}: {
  step: "no-ad" | "soon";
  soonDate: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const testId = step === "no-ad" ? "order-warn-no-ad" : "order-warn-soon";
  return (
    <DialogPrimitive.Root open onOpenChange={(open) => (open ? null : onCancel())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid={testId}
          className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(28rem,calc(100vw-2rem))] -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-2"
        >
          <DialogPrimitive.Title className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold">
            <AlertTriangle
              className={
                step === "soon" ? "size-5 text-status-error-fg" : "size-5 text-status-warning-fg"
              }
            />
            {step === "no-ad" ? "לאשר בלי מודעה?" : "שימי לב — העיתון יורד לדפוס"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div className="mb-4 text-sm text-on-surface-variant">
              {step === "no-ad" ? (
                <p>
                  להזמנה עדיין לא צורף קובץ מודעה. אפשר להמשיך ולהוסיף את הקובץ אחר כך — הפרסומים
                  יסומנו &quot;חסרה מודעה&quot; עד שיגיע.
                </p>
              ) : (
                <p>
                  הפרסום הראשון בהזמנה הוא ב־<Ltr>{soonDate}</Ltr>, השבוע. העיתון יורד לדפוס וצריך
                  את המודעה בזמן. להמשיך בכל זאת?
                </p>
              )}
            </div>
          </DialogPrimitive.Description>
          <div className="flex gap-3 border-t border-outline-variant pt-4">
            <Button onClick={onConfirm} data-testid={`${testId}-confirm`}>
              {step === "no-ad" ? "כן, להמשיך בלי מודעה" : "הבנתי, להמשיך"}
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              ביטול
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function RejectForm({ orderId, onCancel }: { orderId: string; onCancel: () => void }) {
  const bound = rejectOrderAction.bind(null, orderId);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, {});

  return (
    <form action={action} className="max-w-[500px] space-y-3">
      <div>
        <Label htmlFor="reason">סיבת הדחייה</Label>
        <textarea
          id="reason"
          name="reason"
          rows={3}
          data-testid="reject-reason"
          className="w-full rounded-lg border border-outline-variant bg-surface-container p-3 text-start text-sm"
        />
        {/* FR-19: the reason is optional, and saying so prevents a stuck user. */}
        <p className="mt-1 text-xs text-on-surface-variant">
          הסיבה <strong>אינה חובה</strong>. אם תמלאי אותה, היא תוצג ללקוח בפורטל.
        </p>
      </div>

      {state.message ? <InlineError>{state.message}</InlineError> : null}

      <div className="flex gap-3">
        <Button type="submit" variant="destructive" disabled={pending} data-testid="confirm-reject">
          {pending ? "דוחה…" : "דחיית ההזמנה"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          חזרה
        </Button>
      </div>
    </form>
  );
}
