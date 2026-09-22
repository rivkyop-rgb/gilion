"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { MIN_PASSWORD_LENGTH } from "@/lib/domain/password";

export type PasswordFormState = {
  errors?: Record<string, string>;
  message?: string;
  done?: boolean;
};

/**
 * One form, both shells.
 *
 * The internal side and the portal each own a thin Server Action of their own
 * — the portal must not import from `(internal)` (FR-9 keeps the two apart) —
 * and both call the same rule in lib/domain and the same write in lib/data.
 * The duplication that leaves is an adapter; the rule has one home.
 *
 * Nothing is re-shown after a submit. Every field here is a password, and a
 * field that cannot be read back is not one to repopulate: the point of the
 * confirmation box is that the same value was typed twice by a person, and a
 * value React restores was not.
 */
export function PasswordForm({
  action,
  submitLabel = "שינוי סיסמה",
}: {
  action: (state: PasswordFormState, formData: FormData) => Promise<PasswordFormState>;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState<PasswordFormState, FormData>(action, {});
  const err = (f: string) => state.errors?.[f];

  return (
    <form action={formAction} className="space-y-4" data-testid="password-form">
      <div>
        <Label htmlFor="current">הסיסמה הנוכחית</Label>
        <Input
          id="current"
          name="current"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          data-testid="password-current"
        />
        {err("current") ? <InlineError>{err("current")}</InlineError> : null}
      </div>

      <div>
        <Label htmlFor="next">סיסמה חדשה</Label>
        <Input
          id="next"
          name="next"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          data-testid="password-next"
        />
        {err("next") ? <InlineError>{err("next")}</InlineError> : null}
      </div>

      <div>
        <Label htmlFor="confirm">הקלדה חוזרת של הסיסמה החדשה</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          data-testid="password-confirm"
        />
        {err("confirm") ? <InlineError>{err("confirm")}</InlineError> : null}
      </div>

      {state.message ? (
        <p
          data-testid="password-message"
          className={state.done ? "text-sm text-status-success-fg" : "text-sm text-status-error-fg"}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} data-testid="password-submit">
        <KeyRound className="size-4" />
        {pending ? "שומר…" : submitLabel}
      </Button>
    </form>
  );
}
