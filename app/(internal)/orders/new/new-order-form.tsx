"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InlineError, EmptyState } from "@/components/states";
import { createOrderDraftAction, type FormState } from "../actions";

export function NewOrderForm({ customers }: { customers: Array<{ id: string; label: string }> }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrderDraftAction, {});

  if (customers.length === 0) {
    return (
      <EmptyState
        title="אין עדיין לקוחות"
        body="הזמנה שייכת ללקוח, ולכן צריך להוסיף לקוח לפני שאפשר לפתוח הזמנה."
        action={
          <Button asChild>
            <Link href="/customers/new">לקוח חדש</Link>
          </Button>
        }
      />
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div>
        <Label htmlFor="customerId">לקוח</Label>
        <select
          id="customerId"
          name="customerId"
          data-testid="order-customer"
          required
          defaultValue=""
          className="h-10 w-full rounded-sm border border-outline-variant bg-surface-container px-3 text-start text-sm"
        >
          <option value="" disabled>
            בחרי לקוח…
          </option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {state.errors?.customerId ? <InlineError>{state.errors.customerId}</InlineError> : null}
      </div>

      {state.message ? <InlineError>{state.message}</InlineError> : null}

      <div className="flex gap-3 border-t border-outline-variant pt-4">
        <Button type="submit" disabled={pending} data-testid="create-order">
          {pending ? "פותחת…" : "פתיחת טיוטה"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href="/orders">ביטול</Link>
        </Button>
      </div>
    </form>
  );
}
