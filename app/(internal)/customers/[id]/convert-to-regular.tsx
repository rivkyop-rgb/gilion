"use client";

import { useActionState, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { convertToRegularAction, type FormState } from "../actions";

/**
 * casual → regular (US-002). The dialog exists mainly to say out loud that the
 * history survives, because that is the reassurance the requirement is about.
 */
export function ConvertToRegular({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const bound = convertToRegularAction.bind(null, id);
  const [state, action, pending] = useActionState<FormState, FormData>(bound, {});

  if (!open) {
    return (
      <Button variant="secondary" data-testid="open-convert" onClick={() => setOpen(true)}>
        <ArrowLeftRight className="size-4" />
        הפיכה ללקוח קבוע
      </Button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="הפיכה ללקוח קבוע"
      className="w-[500px] max-w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-md"
    >
      <h2 className="mb-1 font-serif text-xl font-semibold">הפיכה ללקוח קבוע</h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        הלקוח יסומן כקבוע ויתווסף לו שם עסק. <strong>כל ההיסטוריה נשמרת</strong> — הזמנות, פרסומים
        ותשלומים קיימים לא משתנים. הפעולה אינה הפיכה.
      </p>

      <form action={action} className="space-y-4">
        <div>
          <Label htmlFor="convert-business-name">שם העסק</Label>
          <Input id="convert-business-name" name="businessName" required autoFocus />
          {state.errors?.businessName ? (
            <InlineError>{state.errors.businessName}</InlineError>
          ) : null}
        </div>
        {state.message ? <InlineError>{state.message}</InlineError> : null}
        <div className="flex gap-3">
          <Button type="submit" disabled={pending} data-testid="confirm-convert">
            {pending ? "ממירה…" : "הפיכה ללקוח קבוע"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            ביטול
          </Button>
        </div>
      </form>
    </div>
  );
}
