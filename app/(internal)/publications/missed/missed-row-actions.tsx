"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, HandCoins } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InlineError } from "@/components/states";
import { creditMissedAction, moveMissedAction } from "./actions";

export function MissedRowActions({
  publicationId,
  label,
  minDate,
}: {
  publicationId: string;
  /** "date · newspaper · customer" — what the dialog names. */
  label: string;
  minDate: string;
}) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {moving ? (
        <>
          <Input
            type="date"
            min={minDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-40"
            data-testid={`missed-date-${publicationId}`}
          />
          <Button
            size="sm"
            disabled={pending || !date}
            data-testid={`missed-move-save-${publicationId}`}
            onClick={() =>
              startTransition(async () => {
                const result = await moveMissedAction(publicationId, date);
                if (!result.ok) return setError(result.message ?? "ההעברה נכשלה");
                setError(null);
                router.replace(
                  `/publications/missed?note=${encodeURIComponent(result.message ?? "")}`,
                  { scroll: false },
                );
              })
            }
          >
            העברה
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMoving(false)}>
            ביטול
          </Button>
        </>
      ) : (
        <>
          <Button
            size="sm"
            variant="secondary"
            data-testid={`missed-move-${publicationId}`}
            onClick={() => setMoving(true)}
          >
            <CalendarClock className="size-4" aria-hidden />
            העברה לתאריך אחר
          </Button>
          <ConfirmDialog
            testId={`missed-credit-dialog-${publicationId}`}
            trigger={
              <Button size="sm" variant="ghost" data-testid={`missed-credit-${publicationId}`}>
                <HandCoins className="size-4" aria-hidden />
                זיכוי הלקוח
              </Button>
            }
            title="לבטל את הפרסום ולזכות את הלקוח?"
            body={
              <p>
                {label} יבוטל. אם שולם עליו — הסכום יעבור לזיכוי של הלקוח וישמש לתשלומים הבאים. אם לא
                שולם — החוב עליו פשוט יירד.
              </p>
            }
            confirmLabel="ביטול וזיכוי"
            pendingLabel="מבטלת…"
            onConfirm={async () => {
              const result = await creditMissedAction(publicationId);
              if (!result.ok) return { message: result.message ?? "הפעולה נכשלה" };
              // The row leaves the list; the outcome is said above it, from the URL.
              router.replace(`/publications/missed?note=${encodeURIComponent(result.message ?? "")}`, {
                scroll: false,
              });
            }}
          />
        </>
      )}
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
