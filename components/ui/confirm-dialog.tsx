"use client";

import { useRef, useState, useTransition } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";

/**
 * A modal confirmation for an action that cannot be undone.
 *
 * Deliberately not `window.confirm`: it cannot be styled, it cannot be tested
 * through the page, and — the reason that matters here — it cannot show WHAT is
 * about to be destroyed. "Are you sure?" is not a question a person can answer;
 * "delete order ORD-4F2A81, 8 lines, ₪9,600?" is.
 *
 * The action runs while the dialog is still open so that a failure is reported
 * where the decision was made, rather than behind a dialog that already closed.
 */
export function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel,
  pendingLabel,
  onConfirm,
  testId,
}: {
  trigger: React.ReactNode;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => Promise<{ message?: string } | void>;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  // Focus lands on "ביטול", never on the destructive button: Radix focuses the
  // first button by default, so the Enter that opened the dialog plus one more
  // deleted an order (UX review, 29/10/2026).
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = () =>
    startTransition(async () => {
      const result = await onConfirm();
      // A successful action usually redirects, so this only runs on failure.
      if (result?.message) setError(result.message);
      else setOpen(false);
    });

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid={testId}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          // Centred with inset-x-0 + mx-auto rather than a translate, so the
          // panel lands in the middle in both directions with no RTL special
          // case — and with no `left-`/`right-` utility, which the lint bans.
          className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(28rem,calc(100vw-2rem))] -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-2"
        >
          <DialogPrimitive.Title className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold">
            <AlertTriangle className="size-5 text-status-error-fg" />
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <div className="mb-4 text-sm text-on-surface-variant">{body}</div>
          </DialogPrimitive.Description>

          {error ? <InlineError>{error}</InlineError> : null}

          <div className="flex gap-3 border-t border-outline-variant pt-4">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={confirm}
              data-testid={testId ? `${testId}-confirm` : undefined}
            >
              {busy ? pendingLabel : confirmLabel}
            </Button>
            <DialogPrimitive.Close asChild>
              <Button ref={cancelRef} variant="ghost" disabled={busy}>
                ביטול
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
