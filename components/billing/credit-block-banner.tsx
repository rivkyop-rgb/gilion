"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Unlock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { releaseCreditBlockAction } from "@/app/(internal)/billing/actions";

/**
 * "This customer cannot order" — said on the card and the billing page, before
 * anybody tries (08/11/2026). A refusal that only arrives after the click reads
 * as the system being wrong (CLAUDE.md). The manager's one-time release is
 * right here, and says that it is one order, not a lifted block.
 */
export function CreditBlockBanner({
  customerId,
  reason,
  releaseWaiting,
  mayRelease,
}: {
  customerId: string;
  reason: string;
  releaseWaiting: boolean;
  mayRelease: boolean;
}) {
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div
      role="status"
      data-testid="credit-block-banner"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-status-error-fg/40 bg-status-error-bg px-4 py-3 text-sm text-status-error-fg"
    >
      <Ban className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <strong>חסום להזמנות חדשות</strong> — {reason}.{" "}
        {releaseWaiting
          ? "מנהל שחרר את החסימה להזמנה אחת, והיא תנוצל בהזמנה הבאה."
          : "החסימה יורדת לבד כשהחוב משולם."}
      </span>
      {mayRelease && !releaseWaiting ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          data-testid="release-credit-block"
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await releaseCreditBlockAction(customerId);
              if (result.message) setError(result.message);
              else router.refresh();
            })
          }
        >
          <Unlock className="size-4" aria-hidden />
          שחרור להזמנה אחת
        </Button>
      ) : null}
      {error ? <span className="w-full text-xs">{error}</span> : null}
    </div>
  );
}
