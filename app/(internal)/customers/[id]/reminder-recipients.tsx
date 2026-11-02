"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";

import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { setReminderRecipientAction } from "../actions";

export type RecipientKind = "reminders" | "tear_sheets" | "billing";

export type RecipientOption = {
  /** "main" or a contact id. */
  target: string;
  label: string;
  phone: string | null;
  email: string | null;
  on: Record<RecipientKind, boolean>;
};

const COLUMNS: Array<{ kind: RecipientKind; label: string; none: string; testPrefix: string }> = [
  {
    kind: "reminders",
    label: "תזכורות",
    none: "לא סומן אף אחד לתזכורות — הן נשלחות לפרטי העסק.",
    testPrefix: "remind",
  },
  {
    kind: "tear_sheets",
    label: "גזירים",
    none: "לא סומן אף אחד לגזירים — הם נשלחים לפרטי העסק.",
    testPrefix: "tear",
  },
  {
    kind: "billing",
    label: "חוב וגבייה",
    none: "לא סומן אף אחד לגבייה — פונים לפרטי העסק.",
    testPrefix: "billing",
  },
];

/**
 * "מי מקבל מה" on the customer's card: one row per way of reaching the
 * customer, one column per reason to reach them — reminders, tear sheets, and
 * who to call about money (the user, 31/10/2026). Saved as it is ticked.
 * Nothing ticked in a column is a real answer — the business's own details —
 * and the box says so rather than leaving it to be guessed.
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

  const toggle = (target: string, kind: RecipientKind, on: boolean) =>
    start(async () => {
      setError(null);
      const result = await setReminderRecipientAction({ customerId, target, kind, on });
      if (result.message) setError(result.message);
      else router.refresh();
    });

  const empty = COLUMNS.filter((c) => options.every((o) => !o.on[c.kind]));

  return (
    <section
      className="mb-8 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1"
      data-testid="reminder-recipients"
    >
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Users className="size-4" aria-hidden />
        מי מקבל מה
      </h2>
      <p className="mb-3 text-xs text-on-surface-variant">
        לכל איש קשר מסמנים למה פונים אליו. ההודעות נשלחות לטלפון ולמייל של מי שמסומן.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-on-surface-variant">
              <th className="pb-2 text-start font-medium">איש קשר</th>
              {COLUMNS.map((c) => (
                <th key={c.kind} className="w-24 pb-2 text-center font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {options.map((o) => {
              const reachable = Boolean(o.phone || o.email);
              return (
                <tr key={o.target} className="border-t border-outline-variant">
                  <td className="py-2">
                    <span className="font-medium">{o.label}</span>
                    <span className="block text-xs text-on-surface-variant">
                      {o.phone ? <Ltr>{o.phone}</Ltr> : null}
                      {o.phone && o.email ? " · " : null}
                      {o.email ? <Ltr>{o.email}</Ltr> : null}
                      {!reachable ? "אין טלפון או מייל" : null}
                    </span>
                  </td>
                  {COLUMNS.map((c) => (
                    <td key={c.kind} className="py-2 text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        aria-label={`${o.label} — ${c.label}`}
                        checked={o.on[c.kind]}
                        disabled={!editable || busy || !reachable}
                        data-testid={`${c.testPrefix}-${o.target}`}
                        onChange={(e) => toggle(o.target, c.kind, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {empty.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-xs text-on-surface-variant">
          {empty.map((c) => (
            <li key={c.kind}>{c.none}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </section>
  );
}
