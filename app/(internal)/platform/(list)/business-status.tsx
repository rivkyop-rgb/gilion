"use client";

import { Power, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  BUSINESS_STATUS_LABELS,
  deactivationConsequence,
  type BusinessStatus,
} from "@/lib/domain/platform";
import { setBusinessStatusAction } from "../actions";

export function BusinessStatusBadge({ status }: { status: BusinessStatus }) {
  return (
    <Badge tone={status === "active" ? "success" : "muted"} data-status={status}>
      {BUSINESS_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Closing a business is the most consequential act in the system, so the
 * dialog states the cost in both directions: who stops being able to work, and
 * what is kept. Reopening needs no such warning — it only restores.
 */
export function BusinessStatusButton({
  id,
  name,
  status,
  counts,
}: {
  id: string;
  name: string;
  status: BusinessStatus;
  counts: { users: number; newspapers: number; customers: number };
}) {
  if (status === "inactive") {
    return (
      <ConfirmDialog
        testId={`activate-${id}`}
        trigger={
          <Button variant="secondary" size="sm" data-testid={`activate-business-${id}`}>
            <Power className="size-4" />
            הפעלה מחדש
          </Button>
        }
        title={`להפעיל מחדש את "${name}"?`}
        body={<p>המשתמשים יוכלו להיכנס שוב, וכל הנתונים יחזרו בדיוק כפי שהיו.</p>}
        confirmLabel="הפעלה מחדש"
        pendingLabel="מפעילה…"
        onConfirm={() => setBusinessStatusAction(id, "active")}
      />
    );
  }

  return (
    <ConfirmDialog
      testId={`deactivate-${id}`}
      trigger={
        <Button variant="ghost" size="sm" data-testid={`deactivate-business-${id}`}>
          <PowerOff className="size-4" />
          השבתה
        </Button>
      }
      title={`להשבית את "${name}"?`}
      body={
        <>
          <p className="mb-2">{deactivationConsequence(counts)}</p>
          <p>
            אפשר להפעיל אותו מחדש בכל רגע מהמסך הזה. <strong>שום דבר לא נמחק.</strong>
          </p>
        </>
      }
      confirmLabel="השבתת העסק"
      pendingLabel="משביתה…"
      onConfirm={() => setBusinessStatusAction(id, "inactive")}
    />
  );
}
