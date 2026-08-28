"use client";

import { useActionState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { ASSIGNABLE_ROLES, MIN_PASSWORD_LENGTH } from "@/lib/domain/team";
import { addMemberAction, type FormState } from "./actions";

export function AddMemberForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(addMemberAction, {});
  const err = (f: string) => state.errors?.[f];
  // React clears an uncontrolled form once its action resolves; without this a
  // single validation error empties every field, password included.
  const was = (f: string) => state.values?.[f] ?? "";

  return (
    <form
      action={action}
      className="mb-8 rounded-lg border border-outline-variant bg-surface-container-lowest p-4"
      data-testid="add-member-form"
    >
      <h2 className="mb-3 font-serif text-lg font-semibold">הוספת משתמש</h2>

      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label htmlFor="name">שם מלא</Label>
          <Input id="name" name="name" defaultValue={was("name")} data-testid="member-name" />
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
            data-testid="member-email"
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
            data-testid="member-password"
          />
          {err("password") ? <InlineError>{err("password")}</InlineError> : null}
        </div>
        <div>
          <Label htmlFor="role">תפקיד</Label>
          <select
            id="role"
            name="role"
            defaultValue={was("role") || "sales"}
            data-testid="member-role"
            className="h-10 w-full rounded-sm border border-outline-variant bg-surface-container px-3 text-start text-sm"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {err("role") ? <InlineError>{err("role")}</InlineError> : null}
        </div>
      </div>

      <p className="mt-2 text-xs text-on-surface-variant">
        הסיסמה מוצגת גלויה כדי שתוכלי למסור אותה. אין עדיין מסך החלפת סיסמה, אז שמרי אותה.
      </p>

      {state.message ? <InlineError>{state.message}</InlineError> : null}

      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        className="mt-3"
        data-testid="add-member"
      >
        <UserPlus className="size-4" />
        {pending ? "מוסיפה…" : "הוספה"}
      </Button>
    </form>
  );
}
