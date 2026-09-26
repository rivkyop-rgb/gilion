"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import { cn } from "@/lib/utils";
import { setOrdersNeedApprovalAction } from "./actions";

const OPTIONS = [
  {
    value: false,
    title: "אישור ישיר",
    body: "הזמנה שמוזנת במשרד מאושרת בלחיצה אחת מהטיוטה, והפרסומים נוצרים מיד.",
  },
  {
    value: true,
    title: "ממתינה לאישור",
    body: "הזמנה שמוזנת במשרד נשלחת לאישור, ומישהו עם הרשאת הזמנות מאשר אותה בנפרד. בלוח הבקרה מופיע כרטיס של הזמנות שממתינות.",
  },
] as const;

export function OrderApprovalForm({ current }: { current: boolean }) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await setOrdersNeedApprovalAction(value);
      if (result.message) setError(result.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <div className="max-w-2xl rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1">
      <fieldset>
        <legend className="mb-3 text-sm font-medium">הזמנות שמוזנות במשרד</legend>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
          {OPTIONS.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={value === o.value}
              data-testid={`orders-approval-${o.value ? "required" : "direct"}`}
              onClick={() => {
                setValue(o.value);
                setSaved(false);
              }}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-4 text-start transition",
                value === o.value
                  ? "border-secondary bg-state-active/40"
                  : "border-outline-variant hover:border-brand-gold",
              )}
            >
              <span className="font-semibold">{o.title}</span>
              <span className="text-xs text-on-surface-variant">{o.body}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <p className="mt-4 text-xs text-on-surface-variant">
        בקשות שלקוחות שולחים מהפורטל ממתינות לאישור תמיד, בלי קשר לבחירה כאן — אף אחד במשרד עוד לא
        ראה אותן.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <Button
          disabled={busy || value === current}
          onClick={save}
          data-testid="save-orders-approval"
        >
          {busy ? "שומרת…" : "שמירה"}
        </Button>
        {saved ? (
          <span
            role="status"
            className="text-sm text-status-success-fg"
            data-testid="orders-approval-saved"
          >
            נשמר.
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </div>
  );
}
