"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Info, UserPlus, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InlineError, EmptyState } from "@/components/states";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { createOrderDraftAction, type FormState } from "../actions";

export function NewOrderForm({
  customers,
  defaultCustomerId = "",
}: {
  customers: ComboboxOption[];
  defaultCustomerId?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createOrderDraftAction, {});
  const [customerId, setCustomerId] = useState(defaultCustomerId);

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
    // Design 03: the customer on the right, the summary and the commit on the
    // left. Lines arrive on the next screen, and the summary says so rather
    // than showing an empty table that looks like it should be filled here.
    <form action={action} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-serif text-xl font-semibold">
            <UserSearch className="size-5 text-secondary" aria-hidden />
            פרטי לקוח
          </h2>
          <Link
            href="/customers/new"
            className="inline-flex items-center gap-1 text-sm font-medium text-on-surface-variant hover:text-on-surface"
          >
            <UserPlus className="size-4" aria-hidden />
            לקוח חדש
          </Link>
        </div>

        <Label htmlFor="customerId">בחירת לקוח מהרשימה</Label>
        {/* Type to filter: the list is every customer in the business, which
            scrolls badly long before it loads slowly. */}
        <Combobox
          id="customerId"
          name="customerId"
          testId="order-customer"
          options={customers}
          defaultValue={defaultCustomerId}
          required
          placeholder="הקלידי שם עסק או טלפון…"
          emptyText="אין לקוח שמתאים לחיפוש"
          onChange={setCustomerId}
        />
        <p className="mt-1 text-xs text-on-surface-variant">{customers.length} לקוחות ברשימה.</p>
        {state.errors?.customerId ? <InlineError>{state.errors.customerId}</InlineError> : null}
      </section>

      <aside className="overflow-hidden rounded-xl border border-outline-variant border-t-4 border-t-primary bg-surface-container-lowest shadow-elevation-1">
        <div className="p-5">
          <h2 className="mb-4 border-b border-outline-variant pb-3 font-serif text-xl font-semibold">
            סיכום הזמנה
          </h2>
          <p className="mb-5 text-sm text-on-surface-variant">
            אחרי פתיחת הטיוטה מוסיפים את שורות הפרסום — עיתון, תאריך, גודל ומחיר — ורואים כאן את
            הסכום.
          </p>

          {state.message ? <InlineError>{state.message}</InlineError> : null}

          <div className="flex flex-col gap-2">
            <Button type="submit" disabled={pending || !customerId} data-testid="create-order">
              {pending ? "פותחת…" : "פתיחת טיוטה"}
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href="/orders">ביטול</Link>
            </Button>
          </div>
        </div>
        <p className="flex items-start gap-2 border-t border-outline-variant bg-surface-container-low px-5 py-3 text-xs text-on-surface-variant">
          <Info className="size-4 shrink-0" />
          פרסומים מחייבים נוצרים רק אחרי אישור ההזמנה.
        </p>
      </aside>
    </form>
  );
}
