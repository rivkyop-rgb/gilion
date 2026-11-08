"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePendingLines } from "./pending-lines";
import { useFormActionState } from "@/components/use-form-action-state";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle, Check, Ban, Trash2, X, Plus, ListOrdered, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Ltr } from "@/components/ui/ltr";
import { agrees, counted } from "@/lib/domain/hebrew-count";
import { canDeleteOrder, type OrderStatus } from "@/lib/domain/order-status";
import {
  approveOrderAction,
  cancelOrderAction,
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
  customerId,
  orderRef,
  status,
  canApprove,
  publicationCount,
  lineCount,
  total,
  layout = "bar",
  directApproval = false,
  missingAd = false,
  soonDate = null,
  capacity = [],
}: {
  orderId: string;
  /** For the "what next" links after the order is sent or approved. */
  customerId: string;
  orderRef: string;
  status: OrderStatus;
  canApprove: boolean;
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
  /** Covers and backs this order would oversell (lib/data/page-load.ts). */
  capacity?: CapacityNote[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);

  const run = (fn: () => Promise<FormState>, after?: "submitted" | "approved") =>
    startTransition(async () => {
      const message = (await fn()).message ?? null;
      setError(message);
      if (!message && after) setDone(after);
    });

  // Shown once the order went forward: the three things people do next, so the
  // page does not just sit there (the user, 31/10/2026).
  const [done, setDone] = useState<"submitted" | "approved" | null>(null);

  // Nothing to send yet, or dates picked above and not added: the button says
  // why instead of sending an order without them (the user, 31/10/2026).
  const pendingLines = usePendingLines();
  const blockedReason =
    lineCount === 0
      ? 'קודם מוסיפים להזמנה לפחות פרסום אחד — בטופס "הוספת פרסום להזמנה".'
      : pendingLines > 0
        ? `${pendingLines === 1 ? "נבחר תאריך אחד שעוד לא נוסף" : `נבחרו ${pendingLines} תאריכים שעוד לא נוספו`} — לוחצים "הוספה להזמנה", או מסירים אותם.`
        : null;

  /**
   * Moving an order forward without its artwork asks first — and if the paper
   * prints within the week, asks again, separately (the user's rule): two
   * different warnings, each confirmed on its own, never one dialog carrying
   * both where the second sentence is read past.
   */
  const [warning, setWarning] = useState<{ steps: WarnStep[]; go: () => void } | null>(null);
  const guarded = (fn: () => Promise<FormState>, approving: boolean) => () => {
    const go = () => {
      setWarning(null);
      run(fn, approving ? "approved" : "submitted");
    };
    // The page-capacity question is about APPROVING — sending for approval
    // oversells nothing (12/10/2026). It must be confirmed to go on.
    const steps: WarnStep[] = [
      ...(missingAd ? (["no-ad"] as const) : []),
      ...(missingAd && soonDate ? (["soon"] as const) : []),
      ...(approving && capacity.length > 0 ? (["capacity"] as const) : []),
    ];
    if (steps.length === 0) return go();
    setWarning({ steps, go });
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

      {status === "draft" && blockedReason ? (
        <p className="mb-2 text-xs text-status-warning-fg" data-testid="order-blocked-reason">
          {blockedReason}
        </p>
      ) : null}

      {done ? (
        <div
          role="status"
          data-testid="order-next-steps"
          className="mb-3 rounded-lg bg-status-success-bg p-3 text-sm text-status-success-fg"
        >
          <p className="mb-2 font-semibold">
            {done === "approved" ? "ההזמנה אושרה." : "ההזמנה נשלחה לאישור."} מה עכשיו?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="secondary">
              <Link href={`/orders/new?customer=${customerId}`}>
                <Plus className="size-4" />
                הזמנה נוספת ללקוח
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/customers/${customerId}?tab=orders`}>
                <ListOrdered className="size-4" />
                כל ההזמנות של הלקוח
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/billing/customers/${customerId}`}>
                <Wallet className="size-4" />
                רישום תשלום
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {rejecting ? (
        <RejectForm orderId={orderId} onCancel={() => setRejecting(false)} />
      ) : (
        <div className={layout === "bar" ? "flex flex-wrap gap-3" : "flex flex-col gap-2"}>
          {status === "draft" && directApproval && canApprove ? (
            <Button
              variant="gold"
              disabled={busy || blockedReason !== null}
              data-testid="approve-order"
              onClick={guarded(() => approveOrderAction(orderId), true)}
            >
              <Check className="size-4" />
              אישור ההזמנה
            </Button>
          ) : status === "draft" ? (
            <Button
              variant="gold"
              disabled={busy || blockedReason !== null}
              data-testid="submit-order"
              onClick={guarded(() => submitOrderAction(orderId), false)}
            >
              שליחה לאישור
            </Button>
          ) : null}

          {status === "pending_approval" && canApprove ? (
            <>
              <Button
                variant="gold"
                disabled={busy}
                data-testid="approve-order"
                onClick={guarded(() => approveOrderAction(orderId), true)}
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
          step={warning.steps[0]!}
          soonDate={soonDate}
          capacity={capacity}
          onCancel={() => setWarning(null)}
          onConfirm={() => {
            const rest = warning.steps.slice(1);
            if (rest.length > 0) setWarning({ steps: rest, go: warning.go });
            else warning.go();
          }}
        />
      ) : null}
    </div>
  );
}

type WarnStep = "no-ad" | "soon" | "capacity";

export type CapacityNote = {
  newspaperName: string;
  /** Already formatted for display. */
  date: string;
  pageTypeName: string;
  approved: number;
  pending: number;
  mine: number;
  overflow: number;
  pagesOfType: number;
  hasIssue: boolean;
};

/** One warning at a time — see `guarded`. */
function OrderWarning({
  step,
  soonDate,
  capacity,
  onCancel,
  onConfirm,
}: {
  step: WarnStep;
  soonDate: string | null;
  capacity: CapacityNote[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const testId = `order-warn-${step}`;
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
                step === "no-ad" ? "size-5 text-status-warning-fg" : "size-5 text-status-error-fg"
              }
            />
            {step === "no-ad"
              ? "לאשר בלי מודעה?"
              : step === "soon"
                ? "שימי לב — העיתון יורד לדפוס"
                : "אין מקום פנוי בעמוד שנבחר"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div className="mb-4 text-sm text-on-surface-variant">
              {step === "no-ad" ? (
                <p>
                  להזמנה עדיין לא צורף קובץ מודעה. אפשר להמשיך ולהוסיף את הקובץ אחר כך — הפרסומים
                  יסומנו &quot;חסר קובץ&quot; עד שיגיע.
                </p>
              ) : step === "capacity" ? (
                <CapacityBody notes={capacity} />
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
              {step === "no-ad"
                ? "כן, להמשיך בלי מודעה"
                : step === "capacity"
                  ? "לאשר בכל זאת"
                  : "הבנתי, להמשיך"}
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

/**
 * Which cover or back would be oversold, and by what. Pending orders are named
 * separately: "it is full" and "it is full if the order waiting since Sunday is
 * approved" are different conversations with the customer.
 */
function CapacityBody({ notes }: { notes: CapacityNote[] }) {
  return (
    <div className="space-y-2">
      <p>אישור ההזמנה ימכור יותר ממה שנכנס בעמודים האלה:</p>
      <ul className="space-y-1.5" data-testid="capacity-notes">
        {notes.map((n) => (
          <li
            key={`${n.newspaperName}-${n.date}-${n.pageTypeName}`}
            className="rounded-lg bg-status-error-bg p-2 text-status-error-fg"
          >
            <strong>
              {n.pageTypeName} · {n.newspaperName} · <Ltr>{n.date}</Ltr>
            </strong>
            <br />
            {soldSentence(n)}
          </li>
        ))}
      </ul>
      <p>
        אפשר לאשר בכל זאת — למשל אם עמוד נוסף מהסוג הזה ייפתח בגיליון — אבל זו החלטה, לא ברירת מחדל.
      </p>
    </div>
  );
}

function soldSentence(n: CapacityNote): string {
  if (n.pagesOfType === 0) {
    // Not "full" — absent. Saying "won't fit" about the only ad on an empty
    // issue reads as a broken system (the user, 03/11/2026).
    return `${n.hasIssue ? "בגיליון של התאריך הזה" : "בגיליון הרגיל של העיתון"} אין אף עמוד מסוג "${n.pageTypeName}", ולכן אין איפה לשבץ את ${counted(n.mine, "הפרסום", "הפרסומים")}. אפשר להוסיף עמוד מהסוג הזה בלוח השיבוץ, או לבחור בהזמנה סוג עמוד אחר. אם הכוונה הייתה למקום בגיליון (למשל אמצע) — בוחרים את זה ב"מיקום בגיליון".`;
  }
  const parts: string[] = [];
  if (n.approved > 0) {
    parts.push(
      `${agrees(n.approved, "כבר נמכר", "כבר נמכרו")} ${counted(n.approved, "פרסום מאושר אחד", "פרסומים מאושרים")}`,
    );
  }
  if (n.pending > 0) {
    parts.push(
      n.pending === 1
        ? "עוד שורה אחת ממתינה לאישור בהזמנה אחרת"
        : `עוד ${n.pending} שורות ממתינות לאישור בהזמנות אחרות`,
    );
  }
  const before = parts.length > 0 ? `${parts.join(", ")}, ו` : "";
  return `${before}ההזמנה הזאת מוסיפה ${counted(n.mine, "פרסום אחד", "פרסומים")}. ${counted(n.overflow, "פרסום אחד לא ייכנס", "פרסומים לא ייכנסו")}.`;
}

function RejectForm({ orderId, onCancel }: { orderId: string; onCancel: () => void }) {
  const bound = rejectOrderAction.bind(null, orderId);
  const [state, action, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    bound,
    {},
  );

  return (
    <form action={action} onReset={keepTypedOnError} className="max-w-[500px] space-y-3">
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
