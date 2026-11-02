"use client";

import { useRef, useState } from "react";
import { useFormActionState } from "@/components/use-form-action-state";
import Link from "next/link";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
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
  preferredPage?: string;
  contacts: ContactRow[];
};

type ContactRow = {
  name: string;
  role: string;
  phone: string;
  email: string;
  /** What this person is contacted about (the user, 31/10/2026). */
  receivesReminders?: boolean;
  receivesTearSheets?: boolean;
  receivesBilling?: boolean;
};

type Flags = { reminders: boolean; tearSheets: boolean; billing: boolean };
const FLAG_LABELS: Array<{ key: keyof Flags; label: string; field: string }> = [
  { key: "reminders", label: "תזכורות", field: "contact_reminders" },
  { key: "tearSheets", label: "גזירים", field: "contact_tear_sheets" },
  { key: "billing", label: "חוב וגבייה", field: "contact_billing" },
];

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
  const [state, formAction, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    action,
    {},
  );

  const err = (field: string) => state.errors?.[field];

  return (
    <form action={formAction} onReset={keepTypedOnError} className="space-y-5">
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

      <div className="max-w-xs">
        <Label htmlFor="preferredPage">עמוד קבוע בעיתון</Label>
        <Input
          id="preferredPage"
          name="preferredPage"
          dir="ltr"
          inputMode="numeric"
          placeholder="לא חובה"
          defaultValue={initial.preferredPage ?? ""}
          aria-invalid={Boolean(err("preferredPage"))}
          data-testid="customer-preferred-page"
        />
        <p className="mt-1 text-xs text-on-surface-variant">
          השיבוץ האוטומטי ינסה להניח את המודעות שלו בעמוד הזה. עמוד שנקבע בהזמנה עצמה גובר.
        </p>
        {err("preferredPage") ? <InlineError>{err("preferredPage")}</InlineError> : null}
      </div>

      <div>
        <Label htmlFor="notes">הערות</Label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={NOTES_MAX}
          defaultValue={initial.notes}
          data-testid="customer-notes"
          className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {err("notes") ? <InlineError>{err("notes")}</InlineError> : null}
      </div>
      {state.duplicates?.length ? (
        <div
          role="alert"
          data-testid="customer-duplicates"
          className="rounded-lg border border-status-warning-fg/30 bg-status-warning-bg p-4 text-sm text-status-warning-fg"
        >
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            חלק מהפרטים כבר קיימים אצל לקוח אחר
          </p>
          <ul className="mb-3 list-inside list-disc space-y-1">
            {state.duplicates.map((d) => (
              <li key={d.text}>
                {d.text} ·{" "}
                <Link href={`/customers/${d.customerId}`} target="_blank" className="underline">
                  לכרטיס
                </Link>
              </li>
            ))}
          </ul>
          <p className="mb-3">אם זה בסדר (למשל אותה הנהלת חשבונות לשני לקוחות) — אפשר להמשיך.</p>
          <Button
            type="submit"
            name="confirmDuplicates"
            value="1"
            variant="secondary"
            disabled={pending}
            data-testid="confirm-duplicates"
          >
            כן, לשמור בכל זאת
          </Button>
        </div>
      ) : state.message ? (
        <InlineError>{state.message}</InlineError>
      ) : null}

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
  const [rows, setRows] = useState(() =>
    initial.map((c, key) => ({
      key,
      initial: c,
      flags: {
        reminders: c.receivesReminders ?? false,
        tearSheets: c.receivesTearSheets ?? false,
        billing: c.receivesBilling ?? false,
      } as Flags,
    })),
  );
  const setFlag = (key: number, flag: keyof Flags, on: boolean) =>
    setRows((all) =>
      all.map((r) => (r.key === key ? { ...r, flags: { ...r.flags, [flag]: on } } : r)),
    );

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
          className="grid gap-2 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3 sm:grid-cols-2"
        >
          {/* One value per row per flag, in document order — a checkbox that
              is not ticked sends nothing, which would shift every row after it. */}
          {FLAG_LABELS.map((f) => (
            <input
              key={f.field}
              type="hidden"
              name={f.field}
              value={row.flags[f.key] ? "1" : "0"}
            />
          ))}
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
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:col-span-2"
            data-testid={`contact-flags-${i}`}
          >
            <span className="text-xs text-on-surface-variant">פונים אליו בנושא:</span>
            {FLAG_LABELS.map((f) => (
              <label key={f.key} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={row.flags[f.key]}
                  onChange={(e) => setFlag(row.key, f.key, e.target.checked)}
                  data-testid={`contact-${f.key}-${i}`}
                />
                {f.label}
              </label>
            ))}
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
              {
                key: next.current++,
                initial: { name: "", role: "", phone: "", email: "" },
                flags: { reminders: false, tearSheets: false, billing: false },
              },
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
