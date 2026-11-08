"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/states";
import { setCreditPolicyAction } from "./actions";

/**
 * The credit block's two limits (user, 08/11/2026). Empty means "no limit by
 * this one"; a customer is blocked when EITHER is passed. Only printed, unpaid
 * money counts — next month's weeks are owed but not due.
 */
export function CreditPolicyForm({
  current,
  mayEdit,
}: {
  current: { days: number | null; amount: number | null };
  mayEdit: boolean;
}) {
  const [days, setDays] = useState(current.days?.toString() ?? "");
  const [amount, setAmount] = useState(current.amount?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await setCreditPolicyAction({
        days: toNumber(days),
        amount: toNumber(amount),
      });
      if (result.message) setError(result.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  const dirty = toNumber(days) !== current.days || toNumber(amount) !== current.amount;

  return (
    <section
      className="mt-6 max-w-2xl rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1"
      data-testid="credit-policy"
    >
      <h2 className="mb-1 flex items-center gap-2 font-serif text-xl font-semibold">
        <Ban className="size-5" aria-hidden />
        חסימת לקוחות עם חוב
      </h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        לקוח שעבר אחת המגבלות לא יוכל לפתוח הזמנה חדשה — לא במשרד, לא בפורטל ולא במכירה מהלוח — עד
        שישלם, או עד שמנהל ישחרר אותו. כל שחרור מאפשר הזמנה אחת בלבד. נספר רק מה שכבר פורסם ולא
        שולם. שדה ריק = בלי מגבלה כזו.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          חוב שפתוח יותר מ־
          <span className="mt-1 flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              dir="ltr"
              value={days}
              disabled={!mayEdit}
              onChange={(e) => {
                setDays(e.target.value);
                setSaved(false);
              }}
              className="w-28"
              data-testid="credit-days"
            />
            ימים
          </span>
        </label>
        <label className="text-sm">
          או חוב גבוה מ־
          <span className="mt-1 flex items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              min={1}
              dir="ltr"
              value={amount}
              disabled={!mayEdit}
              onChange={(e) => {
                setAmount(e.target.value);
                setSaved(false);
              }}
              className="w-36"
              data-testid="credit-amount"
            />
            ₪
          </span>
        </label>
      </div>
      {mayEdit ? (
        <div className="mt-4 flex items-center gap-3">
          <Button
            size="sm"
            disabled={busy || !dirty}
            onClick={save}
            data-testid="save-credit-policy"
          >
            {busy ? "שומר…" : "שמירה"}
          </Button>
          {saved ? (
            <span role="status" className="text-sm text-status-success-fg">
              נשמר
            </span>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-on-surface-variant">רק מנהל יכול לשנות.</p>
      )}
      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </section>
  );
}
