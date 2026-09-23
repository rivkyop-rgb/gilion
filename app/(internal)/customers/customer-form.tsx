"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { CONTACTS_MAX, NOTES_MAX } from "@/lib/domain/customer";
import type { FormState } from "./actions";

export type CustomerFormValues = {
  businessName: string;
  taxId: string;
  phone: string;
  email: string;
  notes: string;
  contacts: ContactRow[];
};

type ContactRow = { name: string; role: string; phone: string; email: string };

const EMPTY: CustomerFormValues = {
  businessName: "",
  taxId: "",
  phone: "",
  email: "",
  notes: "",
  // One empty row open: a new customer almost always has a person to name,
  // and a blank row is dropped on save, so it costs nothing to offer.
  contacts: [{ name: "", role: "", phone: "", email: "" }],
};

export function CustomerForm({
  action,
  initial = EMPTY,
  submitLabel = "שמירה",
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: CustomerFormValues;
  submitLabel?: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});

  const err = (field: string) => state.errors?.[field];

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <div>
          <Label htmlFor="businessName">שם העסק</Label>
          <Input
            id="businessName"
            name="businessName"
            defaultValue={initial.businessName}
            aria-invalid={Boolean(err("businessName"))}
            required
          />
          {err("businessName") ? <InlineError>{err("businessName")}</InlineError> : null}
        </div>
        <div>
          <Label htmlFor="taxId">ח.פ / ע.מ</Label>
          <Input
            id="taxId"
            name="taxId"
            dir="ltr"
            inputMode="numeric"
            placeholder="לא חובה"
            defaultValue={initial.taxId}
            aria-invalid={Boolean(err("taxId"))}
          />
          {err("taxId") ? <InlineError>{err("taxId")}</InlineError> : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="phone">טלפון העסק</Label>
          {/* dir=ltr: a phone number is Latin-digit text inside an RTL form */}
          <Input id="phone" name="phone" dir="ltr" defaultValue={initial.phone} inputMode="tel" />
        </div>
        <div>
          <Label htmlFor="email">מייל העסק</Label>
          <Input id="email" name="email" dir="ltr" type="email" defaultValue={initial.email} />
        </div>
      </div>

      <p className="text-xs text-on-surface-variant">
        יש להזין טלפון או מייל של העסק — לפחות אחד מהם.
      </p>

      {err("phone") ? <InlineError>{err("phone")}</InlineError> : null}
      {err("email") ? <InlineError>{err("email")}</InlineError> : null}

      <ContactsEditor initial={initial.contacts} error={err("contacts")} />

      <div>
        <Label htmlFor="notes">הערות</Label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={NOTES_MAX}
          defaultValue={initial.notes}
          data-testid="customer-notes"
          className="w-full rounded-sm border border-outline-variant bg-surface-container px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {err("notes") ? <InlineError>{err("notes")}</InlineError> : null}
      </div>
      {state.message ? <InlineError>{state.message}</InlineError> : null}

      <div className="flex gap-3 border-t border-outline-variant pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? "שומרת…" : submitLabel}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={cancelHref}>ביטול</Link>
        </Button>
      </div>
    </form>
  );
}

/**
 * The people at the business, each with a free-text role. The first row is the
 * main contact.
 *
 * Only the row KEYS live in state; every value stays in its (uncontrolled)
 * input and reaches the server as four repeated fields in document order.
 * Removing a row removes its inputs, so nothing needs re-indexing.
 */
function ContactsEditor({ initial, error }: { initial: ContactRow[]; error?: string }) {
  const next = useRef(initial.length);
  const [rows, setRows] = useState(() => initial.map((c, key) => ({ key, initial: c })));

  return (
    <fieldset className="space-y-3" data-testid="customer-contacts">
      <legend className="mb-1 text-sm font-medium">אנשי קשר</legend>
      {rows.length === 0 ? (
        <p className="text-xs text-on-surface-variant">למשל הנהלת חשבונות או הגרפיקאית של הלקוח.</p>
      ) : null}

      {rows.map((row, i) => (
        <div
          key={row.key}
          data-testid={`contact-row-${i}`}
          className="grid gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 sm:grid-cols-2"
        >
          <Input
            name="contact_name"
            aria-label="שם"
            placeholder="שם"
            defaultValue={row.initial.name}
          />
          <Input
            name="contact_role"
            aria-label="תפקיד"
            placeholder="תפקיד"
            defaultValue={row.initial.role}
          />
          <Input
            name="contact_phone"
            aria-label="טלפון"
            placeholder="טלפון"
            dir="ltr"
            inputMode="tel"
            defaultValue={row.initial.phone}
          />
          <div className="flex gap-2">
            <Input
              name="contact_email"
              aria-label="מייל"
              placeholder="מייל"
              dir="ltr"
              type="email"
              defaultValue={row.initial.email}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="הסרת איש הקשר"
              data-testid={`contact-remove-${i}`}
              onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}

      {rows.length < CONTACTS_MAX ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="contact-add"
          onClick={() =>
            setRows((all) => [
              ...all,
              { key: next.current++, initial: { name: "", role: "", phone: "", email: "" } },
            ])
          }
        >
          <Plus className="size-4" />
          הוספת איש קשר
        </Button>
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
    </fieldset>
  );
}
