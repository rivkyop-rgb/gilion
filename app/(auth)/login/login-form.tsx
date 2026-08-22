"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={action} className="space-y-4">
      <div>
        <Label htmlFor="email">כתובת מייל</Label>
        {/* dir=ltr: an email address is Latin text inside an RTL form */}
        <Input id="email" name="email" type="email" dir="ltr" autoComplete="email" required />
      </div>

      <div>
        <Label htmlFor="password">סיסמה</Label>
        <Input
          id="password"
          name="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          minLength={8}
          required
        />
      </div>

      {state.error ? <InlineError>{state.error}</InlineError> : null}

      <Button type="submit" block size="lg" disabled={pending}>
        {pending ? "מתחברת…" : "כניסה"}
      </Button>
    </form>
  );
}
