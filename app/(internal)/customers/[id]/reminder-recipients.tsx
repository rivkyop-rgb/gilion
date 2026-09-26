"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";

import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { setReminderRecipientAction } from "../actions";

export type RecipientOption = {
  /** "main" or a contact id. */
  target: string;
  label: string;
  phone: string | null;
  email: string | null;
  on: boolean;
};

/**
 * "למי נשלחות תזכורות" on the customer's card: a tick per way of reaching the
 * customer, saved as it is ticked. Nothing ticked is a real answer — the
 * business's own details — and the box says so rather than leaving it to be
 * guessed (lib/domain/reminders.ts `reminderRecipients`).
 */
export function ReminderRecipients({
  customerId,
  options,
  editable,
}: {
  customerId: string;
  options: RecipientOption[];
  editable: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const noneTicked = options.every((o) => !o.on);

  const toggle = (target: string, on: boolean) =>
    start(async () => {
      setError(null);
      const result = await setReminderRecipientAction({ customerId, target, on });
      if (result.message) setError(result.message);
      else router.refresh();
    });

  return (
    <section
      className="mb-8 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1"
      data-testid="reminder-recipients"
    >
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <BellRing className="size-4" aria-hidden />
        למי נשלחות תזכורות
      </h2>
      <p className="mb-3 text-xs text-on-surface-variant">
        {noneTicked
          ? "לא סומן אף אחד — התזכורות נשלחות לפרטי העסק."
          : "התזכורות נשלחות לכל מי שמסומן, בטלפון ובמייל שלו."}
      </p>
      <ul className="space-y-2">
        {options.map((o) => (
          <li key={o.target}>
            <label className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={o.on}
                disabled={!editable || busy || (!o.phone && !o.email)}
                data-testid={`remind-${o.target}`}
                onChange={(e) => toggle(o.target, e.target.checked)}
              />
              <span className="font-medium">{o.label}</span>
              <span className="text-xs text-on-surface-variant">
                {o.phone ? <Ltr>{o.phone}</Ltr> : null}
                {o.phone && o.email ? " · " : null}
                {o.email ? <Ltr>{o.email}</Ltr> : null}
                {!o.phone && !o.email ? "אין טלפון או מייל" : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </section>
  );
}
