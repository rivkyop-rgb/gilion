"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import type { OrderStatus } from "@/lib/domain/order-status";
import {
  approveOrderAction,
  cancelOrderAction,
  completeOrderAction,
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
  status,
  canApprove,
  canComplete,
}: {
  orderId: string;
  status: OrderStatus;
  canApprove: boolean;
  canComplete: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);

  const run = (fn: () => Promise<FormState>) =>
    startTransition(async () => setError((await fn()).message ?? null));

  return (
    <div className="sticky bottom-0 -mx-4 mt-8 border-t border-outline-variant bg-surface-container-lowest px-4 py-4 lg:-mx-8 lg:px-8">
      {error ? <InlineError>{error}</InlineError> : null}

      {rejecting ? (
        <RejectForm orderId={orderId} onCancel={() => setRejecting(false)} />
      ) : (
        <div className="flex flex-wrap gap-3">
          {status === "draft" ? (
            <Button
              disabled={busy}
              data-testid="submit-order"
              onClick={() => run(() => submitOrderAction(orderId))}
            >
              שליחה לאישור
            </Button>
          ) : null}

          {status === "pending_approval" && canApprove ? (
            <>
              <Button
                disabled={busy}
                data-testid="approve-order"
                onClick={() => run(() => approveOrderAction(orderId))}
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
            <Button
              variant="secondary"
              disabled={busy}
              data-testid="complete-order"
              onClick={() => run(() => completeOrderAction(orderId))}
            >
              סימון כהושלמה
            </Button>
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
        </div>
      )}
    </div>
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
          className="w-full rounded-sm border border-outline-variant bg-surface-container p-3 text-start text-sm"
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
