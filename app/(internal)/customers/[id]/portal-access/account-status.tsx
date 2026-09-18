"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setPortalAccountStatusAction } from "./actions";

export function AccountStatusToggle({
  customerId,
  membershipId,
  active,
}: {
  customerId: string;
  membershipId: string;
  active: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        data-testid="portal-account-toggle"
        onClick={() =>
          start(async () => {
            const r = await setPortalAccountStatusAction(customerId, membershipId, !active);
            setError(r.message ?? null);
          })
        }
      >
        {active ? "חסימת גישה" : "החזרת גישה"}
      </Button>
      {error ? <span className="text-xs text-error">{error}</span> : null}
    </span>
  );
}
