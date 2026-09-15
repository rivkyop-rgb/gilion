"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { applyCreditAction } from "../../billing/actions";

const MONEY = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });

/**
 * "This customer has ₪300 left over — put it on this order, or leave it?"
 *
 * Asked at the moment it can be answered and never decided quietly. Money that
 * moved on its own is money that moved without a reason anybody can point at,
 * and the report for the month it moved out of would change retroactively.
 *
 * TWO STATES, and the difference matters:
 *  - a DRAFT owes nothing yet, so this only informs. Applying a credit to
 *    something that may be rejected would have to be undone by hand.
 *  - an APPROVED order is a debt, so the choice is live.
 */
export function CreditPrompt({
  orderId,
  credit,
  open,
  binding,
  mayApply,
}: {
  orderId: string;
  /** What the customer holds with no order named against it. */
  credit: number;
  /** What is still open on THIS order. Zero once it is settled. */
  open: number;
  /** Whether the order is approved — i.e. whether it owes anything yet. */
  binding: boolean;
  mayApply: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Dismissed for this visit — "leave it in the general balance". */
  const [dismissed, setDismissed] = useState(false);

  if (credit <= 0 || dismissed) return null;

  const usable = Math.min(credit, open);

  return (
    <div
      className="mb-4 rounded-lg border border-status-info-fg/30 bg-status-info-bg p-4 text-sm text-status-info-fg"
      data-testid="credit-prompt"
    >
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <Wallet className="size-4 shrink-0" />
        ללקוח <Ltr className="font-semibold">{MONEY.format(credit)}</Ltr> לזכותו
        {binding && usable > 0 ? <span>— לשייך להזמנה הזאת?</span> : null}
      </p>

      {binding && usable > 0 ? (
        <>
          {/* The remainder clause only when there IS one: "ועוד ₪0.00 יישארו"
              is a sentence about nothing, and it makes the reader check. */}
          <p className="mt-1 text-xs opacity-90" data-testid="credit-prompt-detail">
            {credit > usable ? (
              <>
                ישויכו <Ltr>{MONEY.format(usable)}</Ltr> מתוך היתרה, ועוד{" "}
                <Ltr>{MONEY.format(credit - usable)}</Ltr> יישארו ביתרה הכללית.
              </>
            ) : (
              <>
                כל היתרה — <Ltr>{MONEY.format(usable)}</Ltr> — תשויך להזמנה הזאת, ויישארו{" "}
                <Ltr>{MONEY.format(open - usable)}</Ltr> לתשלום.
              </>
            )}
          </p>
          {mayApply ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                data-testid="apply-credit"
                onClick={() => {
                  setError(null);
                  start(async () => {
                    const result = await applyCreditAction(orderId);
                    if (result.message) setError(result.message);
                    else {
                      setNote(result.note ?? "שויך");
                      router.refresh();
                    }
                  });
                }}
              >
                {busy ? "משייך…" : "שיוך להזמנה"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                data-testid="keep-credit"
                onClick={() => setDismissed(true)}
              >
                להשאיר ביתרה הכללית
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-xs">שיוך היתרה נעשה ממסך הגבייה.</p>
          )}
        </>
      ) : (
        <p className="mt-1 text-xs opacity-90">
          {/* A draft owes nothing, so there is nothing to settle yet — but the
              seller should know the money is there while they are selling. */}
          {binding
            ? "ההזמנה הזאת שולמה במלואה. אפשר לשייך את היתרה להזמנה אחרת ממסך הגבייה."
            : "היתרה תוצע לשיוך ברגע שההזמנה תאושר."}
        </p>
      )}

      {error ? (
        <div className="mt-2">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
      {note ? (
        <p role="status" className="mt-2 text-xs font-medium" data-testid="credit-applied-note">
          {note}
        </p>
      ) : null}
    </div>
  );
}
