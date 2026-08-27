"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InlineError, EmptyState } from "@/components/states";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { createOrderDraftAction, type FormState } from "../actions";

export function NewOrderForm({ customers }: { customers: ComboboxOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrderDraftAction, {});
  const [customerId, setCustomerId] = useState("");

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
        {/* Type to filter: the list is every customer in the business, which
            scrolls badly long before it loads slowly. */}
        <Combobox
          id="customerId"
          name="customerId"
          testId="order-customer"
          options={customers}
          required
          placeholder="הקלידי שם לקוח, שם עסק או טלפון…"
          emptyText="אין לקוח שמתאים לחיפוש"
          onChange={setCustomerId}
        />
        <p className="mt-1 text-xs text-on-surface-variant">{customers.length} לקוחות ברשימה.</p>
        {state.errors?.customerId ? <InlineError>{state.errors.customerId}</InlineError> : null}
      </div>

      {state.message ? <InlineError>{state.message}</InlineError> : null}

      <div className="flex gap-3 border-t border-outline-variant pt-4">
        <Button type="submit" disabled={pending || !customerId} data-testid="create-order">
          {pending ? "פותחת…" : "פתיחת טיוטה"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href="/orders">ביטול</Link>
        </Button>
      </div>
    </form>
  );
}
