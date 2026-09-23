"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Plus, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { cn } from "@/lib/utils";
import { CONTACTS_MAX, NOTES_MAX, type CustomerType } from "@/lib/domain/customer";
import type { FormState } from "./actions";

export type CustomerFormValues = {
  customerType: CustomerType;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  notes: string;
  contacts: ContactRow[];
};

type ContactRow = { name: string; role: string; phone: string; email: string };

const EMPTY: CustomerFormValues = {
  customerType: "casual",
  businessName: "",
  contactName: "",
  phone: "",
  email: "",
  notes: "",
  contacts: [],
};

export function CustomerForm({
  action,
  initial = EMPTY,
  /** Type is fixed while editing: changing it goes through the conversion flow. */
  lockType = false,
  submitLabel = "שמירה",
  cancelHref,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: CustomerFormValues;
  lockType?: boolean;
  submitLabel?: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const [type, setType] = useState<CustomerType>(initial.customerType);

  const err = (field: string) => state.errors?.[field];

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="customerType" value={type} />

      <fieldset disabled={lockType}>
        <Label>סוג לקוח</Label>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { value: "casual", label: "מזדמן", hint: "פרסום חד־פעמי", icon: User },
              { value: "regular", label: "קבוע", hint: "עסק שמפרסם דרך קבע", icon: Building2 },
            ] as const
          ).map((opt) => {
            const Icon = opt.icon;
            const active = type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                data-testid={`type-${opt.value}`}
                aria-pressed={active}
                onClick={() => setType(opt.value)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border p-4 text-start transition",
                  active
                    ? "border-secondary bg-state-active text-on-secondary-container"
                    : "border-outline-variant bg-surface-container-lowest hover:border-brand-gold",
                  lockType && "cursor-not-allowed opacity-60",
                )}
              >
                <Icon className="size-5" />
                <span className="font-semibold">{opt.label}</span>
                <span className="text-xs opacity-80">{opt.hint}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {type === "regular" ? (
        <div>
          <Label htmlFor="businessName">שם העסק</Label>
          <Input
            id="businessName"
            name="businessName"
            defaultValue={initial.businessName}
            aria-invalid={Boolean(err("businessName"))}
          />
          {err("businessName") ? <InlineError>{err("businessName")}</InlineError> : null}
        </div>
      ) : (
        <input type="hidden" name="businessName" value="" />
      )}

      <div>
        <Label htmlFor="contactName">שם איש קשר</Label>
        <Input
          id="contactName"
          name="contactName"
          defaultValue={initial.contactName}
          aria-invalid={Boolean(err("contactName"))}
          required
        />
        {err("contactName") ? <InlineError>{err("contactName")}</InlineError> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="phone">טלפון</Label>
          {/* dir=ltr: a phone number is Latin-digit text inside an RTL form */}
          <Input id="phone" name="phone" dir="ltr" defaultValue={initial.phone} inputMode="tel" />
        </div>
        <div>
          <Label htmlFor="email">כתובת מייל</Label>
          <Input id="email" name="email" dir="ltr" type="email" defaultValue={initial.email} />
        </div>
      </div>

      <p className="text-xs text-on-surface-variant">
        יש להזין טלפון או כתובת מייל — לפחות אחד מהם.
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
 * People beyond the main contact, each with a free-text role.
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
      <legend className="mb-1 text-sm font-medium">אנשי קשר נוספים</legend>
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
