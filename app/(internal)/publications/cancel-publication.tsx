"use client";

import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Ltr } from "@/components/ui/ltr";
import { cancelPublicationAction } from "../orders/actions";

/**
 * Cancelling ONE publication out of an order (rule 18).
 *
 * The action has existed since stage 04, audited, and was reachable from no
 * screen — so a customer who ordered ten dates and dropped one left you
 * cancelling the whole order. It is a confirmation rather than a plain button
 * because it cannot be undone: `canceled` is terminal in the state machine,
 * and the way back is a new order line.
 */
export function CancelPublication({
  publicationId,
  label,
  date,
}: {
  publicationId: string;
  label: string;
  date: string;
}) {
  const router = useRouter();

  return (
    <ConfirmDialog
      testId={`cancel-publication-${publicationId}`}
      trigger={
        <Button variant="ghost" size="sm" data-testid={`open-cancel-${publicationId}`}>
          <Ban className="size-4" />
          <span className="sr-only">ביטול הפרסום</span>
        </Button>
      }
      title="לבטל את הפרסום הזה?"
      body={
        <>
          <p className="mb-2">
            הפרסום של <strong>{label}</strong> בתאריך <Ltr>{date}</Ltr> יבוטל. שאר הפרסומים באותה
            הזמנה לא ייגעו.
          </p>
          <p>ביטול הוא סופי — כדי להחזיר את התאריך צריך שורה חדשה בהזמנה.</p>
        </>
      }
      confirmLabel="ביטול הפרסום"
      pendingLabel="מבטלת…"
      onConfirm={async () => {
        const result = await cancelPublicationAction(publicationId);
        if (!result.message) router.refresh();
        return result;
      }}
    />
  );
}
