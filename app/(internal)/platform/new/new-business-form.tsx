"use client";

import { useFormActionState } from "@/components/use-form-action-state";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { MIN_PASSWORD_LENGTH } from "@/lib/domain/platform";
import { createBusinessAction, type FormState } from "../actions";

export function NewBusinessForm({ cancelHref = "/platform" }: { cancelHref?: string | null }) {
  const [state, action, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    createBusinessAction,
    {},
  );
  const err = (f: string) => state.errors?.[f];
  // Re-seed from what was submitted — see the note on FormState.values.
  const was = (f: string) => state.values?.[f] ?? "";

  return (
    <form action={action} onReset={keepTypedOnError} className="space-y-5">
      <div>
        <Label htmlFor="businessName">שם העסק</Label>
        <Input
          id="businessName"
          name="businessName"
          defaultValue={was("businessName")}
          data-testid="business-name"
          required
        />
        <p className="mt-1 text-xs text-on-surface-variant">
          שם ההוצאה או החברה — לא שם של עיתון. העיתונים מוגדרים בתוך העסק אחר כך.
        </p>
        {err("businessName") ? <InlineError>{err("businessName")}</InlineError> : null}
      </div>

      <fieldset className="rounded-lg border border-outline-variant p-4">
        <legend className="px-1 font-serif text-base font-semibold">המנהל הראשון</legend>
        <p className="mb-4 text-sm text-on-surface-variant">
          הוא יקבל תפקיד <strong>מנהל</strong> בעסק הזה בלבד, ולא יראה שום עסק אחר.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="adminName">שם מלא</Label>
            <Input
              id="adminName"
              name="adminName"
              defaultValue={was("adminName")}
              data-testid="admin-name"
              required
            />
            {err("adminName") ? <InlineError>{err("adminName")}</InlineError> : null}
          </div>

          <div>
            <Label htmlFor="adminEmail">כתובת מייל</Label>
            <Input
              id="adminEmail"
              name="adminEmail"
              defaultValue={was("adminEmail")}
              type="email"
              dir="ltr"
              data-testid="admin-email"
              required
            />
            <p className="mt-1 text-xs text-on-surface-variant">זהו שם המשתמש שאיתו הוא יתחבר.</p>
            {err("adminEmail") ? <InlineError>{err("adminEmail")}</InlineError> : null}
          </div>

          <div>
            <Label htmlFor="adminPassword">סיסמה ראשונית</Label>
            <Input
              id="adminPassword"
              name="adminPassword"
              defaultValue={was("adminPassword")}
              type="text"
              dir="ltr"
              minLength={MIN_PASSWORD_LENGTH}
              data-testid="admin-password"
              required
            />
            {/* Shown rather than masked on purpose: whoever fills this form has
                to read the password out to the new admin, and a masked field
                they cannot see is a field they will mistype. */}
            <p className="mt-1 text-xs text-on-surface-variant">
              לפחות {MIN_PASSWORD_LENGTH} תווים. מוצגת במפורש כדי שתוכלי למסור אותה. אחרי הכניסה
              הראשונה אפשר להחליף אותה בתפריט המשתמש.
            </p>
            {err("adminPassword") ? <InlineError>{err("adminPassword")}</InlineError> : null}
          </div>
        </div>
      </fieldset>

      {state.message ? <InlineError>{state.message}</InlineError> : null}

      <div className="flex gap-3 border-t border-outline-variant pt-4">
        <Button type="submit" disabled={pending} data-testid="create-business">
          {pending ? "יוצרת…" : "יצירת העסק והמנהל"}
        </Button>
        {cancelHref ? (
        <Button type="button" variant="ghost" asChild>
          <Link href={cancelHref}>ביטול</Link>
        </Button>
        ) : null}
      </div>
    </form>
  );
}
