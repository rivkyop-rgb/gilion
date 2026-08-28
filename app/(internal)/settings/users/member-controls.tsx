"use client";

import { useState, useTransition } from "react";
import { UserMinus, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InlineError } from "@/components/states";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { ASSIGNABLE_ROLES, type AssignableRole } from "@/lib/domain/team";
import { setMemberRoleAction, setMemberStatusAction } from "./actions";

export function RoleSelect({
  userId,
  role,
  disabled,
}: {
  userId: string;
  role: AssignableRole;
  disabled: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (disabled) return <Badge tone="neutral">{ROLE_LABELS[role]}</Badge>;

  return (
    <div>
      <select
        value={role}
        disabled={busy}
        data-testid={`role-${userId}`}
        onChange={(e) =>
          startTransition(async () => {
            const res = await setMemberRoleAction(userId, e.target.value);
            setError(res.message ?? null);
          })
        }
        className="h-9 rounded-sm border border-outline-variant bg-surface-container px-2 text-start text-sm"
      >
        {ASSIGNABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}

/**
 * Access is switched off, never deleted.
 *
 * The person stays on every order they approved and every audit row they
 * caused; removing the user would either orphan that history or take it with
 * them. "No longer works here" and "never existed" are different facts.
 */
export function AccessButton({
  userId,
  name,
  active,
}: {
  userId: string;
  name: string;
  active: boolean;
}) {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!active) {
    return (
      <div>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          data-testid={`restore-${userId}`}
          onClick={() =>
            startTransition(async () => {
              const res = await setMemberStatusAction(userId, "active");
              setError(res.message ?? null);
            })
          }
        >
          <UserCheck className="size-4" />
          החזרת גישה
        </Button>
        {error ? <InlineError>{error}</InlineError> : null}
      </div>
    );
  }

  return (
    <div>
      <ConfirmDialog
        testId={`revoke-${userId}`}
        trigger={
          <Button variant="ghost" size="sm" data-testid={`revoke-access-${userId}`}>
            <UserMinus className="size-4" />
            הסרת גישה
          </Button>
        }
        title={`להסיר את הגישה של ${name}?`}
        body={
          <>
            <p className="mb-2">
              המשתמש לא יוכל להיכנס יותר לעסק הזה. <strong>החשבון לא נמחק</strong> — הוא נשאר על כל
              ההזמנות שאישר ובלוג הביקורת.
            </p>
            <p>אפשר להחזיר לו גישה בכל רגע מהמסך הזה.</p>
          </>
        }
        confirmLabel="הסרת גישה"
        pendingLabel="מסירה…"
        onConfirm={() => setMemberStatusAction(userId, "inactive")}
      />
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}
