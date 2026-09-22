"use client";

import { useState, useTransition } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { MIN_PASSWORD_LENGTH } from "@/lib/domain/password";

export type ResetResult = { message?: string; done?: boolean };

/**
 * An admin hands somebody a new password, because there is no way to mail one.
 *
 * There is no address to send a reset link to (the mail account is backlog 22),
 * so the only honest flow is the one the office already uses: the admin types a
 * password and says it out loud. What this screen adds over the status quo is
 * that it can be done a SECOND time — until now the password minted at account
 * creation was the password forever, which is why it was left on screen in
 * cleartext.
 *
 * The value is typed twice for the same reason it is on the self-service form:
 * a password field shows nothing back, and a typo here locks somebody else out.
 */
export function ResetPasswordDialog({
  userId,
  name,
  onReset,
  testId,
}: {
  userId: string;
  name: string;
  onReset: (userId: string, next: string, confirm: string) => Promise<ResetResult>;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await onReset(userId, next, confirm);
      if (result.done) {
        setError(null);
        setDone(result.message ?? "הסיסמה אופסה");
        setNext("");
        setConfirm("");
      } else {
        setDone(null);
        setError(result.message ?? "האיפוס נכשל");
      }
    });

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setNext("");
          setConfirm("");
          setError(null);
          setDone(null);
        }
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="sm" data-testid={testId}>
          <KeyRound className="size-4" />
          איפוס סיסמה
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid={`${testId}-dialog`}
          className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(28rem,calc(100vw-2rem))] -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-lg"
        >
          <DialogPrimitive.Title className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold">
            <KeyRound className="size-5 text-primary" />
            איפוס סיסמה ל{name}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <p className="mb-4 text-sm text-on-surface-variant">
              הסיסמה הנוכחית אינה נדרשת ואינה ניתנת לשליפה. יש להקליד סיסמה חדשה ולמסור אותה — לפחות{" "}
              {MIN_PASSWORD_LENGTH} תווים.
            </p>
          </DialogPrimitive.Description>

          <div className="mb-4 space-y-3">
            <div>
              <Label htmlFor={`${testId}-next`}>סיסמה חדשה</Label>
              <Input
                id={`${testId}-next`}
                type="text"
                dir="ltr"
                value={next}
                minLength={MIN_PASSWORD_LENGTH}
                onChange={(e) => setNext(e.target.value)}
                data-testid={`${testId}-next`}
              />
            </div>
            <div>
              <Label htmlFor={`${testId}-confirm`}>הקלדה חוזרת</Label>
              <Input
                id={`${testId}-confirm`}
                type="text"
                dir="ltr"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                data-testid={`${testId}-confirm`}
              />
            </div>
          </div>

          {error ? <InlineError>{error}</InlineError> : null}
          {done ? (
            <p className="text-sm text-status-success-fg" data-testid={`${testId}-done`}>
              {done}
            </p>
          ) : null}

          <div className="mt-4 flex gap-3 border-t border-outline-variant pt-4">
            <Button disabled={busy} onClick={submit} data-testid={`${testId}-submit`}>
              {busy ? "שומר…" : "איפוס"}
            </Button>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" disabled={busy}>
                סגירה
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
