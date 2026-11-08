"use client";

import { useFormActionState } from "@/components/use-form-action-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { MIN_PASSWORD_LENGTH } from "@/lib/domain/team";
import { createPortalAccountAction, type PortalAccountState } from "./actions";

export function PortalAccountForm({
  customerId,
  defaults,
  loginUrl,
}: {
  customerId: string;
  defaults: { name: string; email: string };
  /** The business's own branded portal address (/p/<slug>), not the bare
      /portal/login — that one cannot tell which business it belongs to. */
  loginUrl: string;
}) {
  const [state, action, pending, keepTypedOnError] = useFormActionState<
    PortalAccountState,
    FormData
  >(createPortalAccountAction.bind(null, customerId), {});
  const err = (f: string) => state.errors?.[f];
  // After a failed attempt keep what was typed; after a success start clean.
  const was = (f: "name" | "email" | "password") =>
    state.values?.[f] ?? (f === "password" || state.created ? "" : defaults[f]);

  return (
    <form
      action={action}
      onReset={keepTypedOnError}
      data-testid="portal-account-form"
      className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4"
    >
      <h2 className="mb-3 font-serif text-lg font-semibold">חשבון חדש לפורטל</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="name">שם</Label>
          <Input
            id="name"
            name="name"
            defaultValue={was("name")}
            data-testid="portal-account-name"
          />
          {err("name") ? <InlineError>{err("name")}</InlineError> : null}
        </div>
        <div>
          <Label htmlFor="email">כתובת מייל</Label>
          <Input
            id="email"
            name="email"
            type="email"
            dir="ltr"
            defaultValue={was("email")}
            data-testid="portal-account-email"
          />
          {err("email") ? <InlineError>{err("email")}</InlineError> : null}
        </div>
        <div>
          <Label htmlFor="password">סיסמה ראשונית</Label>
          <Input
            id="password"
            name="password"
            type="text"
            dir="ltr"
            minLength={MIN_PASSWORD_LENGTH}
            defaultValue={was("password")}
            data-testid="portal-account-password"
          />
          {err("password") ? <InlineError>{err("password")}</InlineError> : null}
        </div>
      </div>
      <p className="mt-2 text-xs text-on-surface-variant">
        הסיסמה מוצגת גלויה כדי שתוכלי למסור אותה ללקוח יחד עם הכתובת{" "}
        <span dir="ltr" className="ltr-isolate">
          {loginUrl}
        </span>
        .
      </p>
      {state.message ? <InlineError>{state.message}</InlineError> : null}
      {state.created ? (
        <p data-testid="portal-account-created" className="mt-2 text-sm text-status-success-fg">
          החשבון נוצר. הלקוח יכול להיכנס עכשיו.
        </p>
      ) : null}
      <Button type="submit" className="mt-3" disabled={pending} data-testid="portal-account-submit">
        {pending ? "יוצרת…" : "יצירת חשבון"}
      </Button>
    </form>
  );
}
