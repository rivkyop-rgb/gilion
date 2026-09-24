"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { MAX_REMINDER_DAYS, MIN_REMINDER_DAYS } from "@/lib/domain/reminders";
import { setReminderWindowAction } from "../../reminders/actions";

/**
 * The one number that decides who gets chased and when (FR-11).
 *
 * A setting rather than a constant, because the right answer belongs to the
 * publisher: a weekly with a Tuesday deadline and a monthly catalogue do not
 * chase customers on the same schedule.
 */
export function ReminderWindowForm({ current, affected }: { current: number; affected: number }) {
  const [days, setDays] = useState(String(current));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await setReminderWindowAction(Number(days));
      if (result.message) setError(result.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <div className="max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-6">
      <Label htmlFor="days">כמה ימים לפני הפרסום להתחיל להזכיר</Label>
      <div className="mt-1 flex gap-2">
        <Input
          id="days"
          type="number"
          dir="ltr"
          min={MIN_REMINDER_DAYS}
          max={MAX_REMINDER_DAYS}
          value={days}
          data-testid="reminder-days"
          onChange={(e) => setDays(e.target.value)}
          className="w-28"
        />
        <Button disabled={busy} onClick={save} data-testid="save-reminder-days">
          {busy ? "שומרת…" : "שמירה"}
        </Button>
      </div>

      <p className="mt-3 text-sm text-on-surface-variant" data-testid="reminder-preview">
        בערך הנוכחי ({current} ימים) יש <strong>{affected}</strong> פרסומים שנכנסים לרשימה.
      </p>

      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
      {saved ? (
        <p
          role="status"
          data-testid="reminder-days-saved"
          className="mt-3 text-sm text-status-success-fg"
        >
          נשמר. הרשימה חושבה מחדש.
        </p>
      ) : null}
    </div>
  );
}
