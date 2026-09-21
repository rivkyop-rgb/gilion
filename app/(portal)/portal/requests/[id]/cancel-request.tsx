"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cancelOwnRequestAction } from "../../actions";

/** Rule 8 — offered only while the request is pending; the server checks again. */
export function CancelRequest({ id }: { id: string }) {
  return (
    <ConfirmDialog
      testId="cancel-request-dialog"
      trigger={
        <Button variant="secondary" data-testid="cancel-request">
          ביטול הבקשה
        </Button>
      }
      title="לבטל את הבקשה?"
      body="הבקשה לא תגיע לאישור העיתון. אפשר תמיד לשלוח בקשה חדשה."
      confirmLabel="ביטול הבקשה"
      pendingLabel="מבטלת…"
      onConfirm={() => cancelOwnRequestAction(id)}
    />
  );
}
