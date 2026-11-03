"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useFormActionState } from "@/components/use-form-action-state";
import Link from "next/link";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { CONTACTS_MAX, NOTES_MAX } from "@/lib/domain/customer";
import { checkCustomerDuplicatesAction, type FormState } from "./actions";

export type CustomerFormValues = {
  businessName: string;
  taxId: string;
  phone: string;
  email: string;
  notes: string;
  preferredPage?: string;
  noAutoPlace?: boolean;
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
  customerId,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: CustomerFormValues;
  submitLabel?: string;
  cancelHref: string;
  /** When editing — so the live check does not find the customer itself. */
  customerId?: string;
}) {
  const [state, formAction, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    action,
    {},
  );

  const err = (field: string) => state.errors?.[field];

  // Duplicates found WHILE TYPING (the user, 03/11/2026: "מייד בהקלדה").
  // Asked of the server half a second after the last keystroke; a stale
  // answer is dropped by the sequence number.
  const formRef = useRef<HTMLFormElement>(null);
  const [live, setLive] = useState<Array<{ customerId: string; text: string }>>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const confirmedRef = useRef(false);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const check = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const form = formRef.current;
      if (!form) return;
      const fd = new FormData(form);
      const strings = (name: string) =>
        fd.getAll(name).map(String).filter((v) => v.trim() !== "");
      const mine = ++seq.current;
      const hits = await checkCustomerDuplicatesAction({
        taxId: String(fd.get("taxId") ?? ""),
        phones: [...strings("phone"), ...strings("contact_phone")],
        emails: [...strings("email"), ...strings("contact_email")],
        exceptId: customerId,
      }).catch(() => []);
      if (mine === seq.current) setLive(hits);
    }, 500);
  };
  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);
  const shown = state.duplicates?.length ? state.duplicates : live;

  return (
    <form
      ref={formRef}
      action={formAction}
      onReset={keepTypedOnError}
      onChange={check}
      onSubmit={(e) => {
        // A known duplicate is asked about BEFORE the round trip, in a popup
        // with one button that saves (the user, 03/11/2026).
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (live.length > 0 && submitter?.name !== "confirmDuplicates" && !confirmedRef.current) {
          e.preventDefault();
          setConfirmOpen(true);
        }
        confirmedRef.current = false;
      }}
      className="space-y-5"
    >
      <DuplicateConfirm
        open={confirmOpen}
        items={live}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          confirmedRef.current = true;
          const button = formRef.current?.querySelector<HTMLButtonElement>(
            '[data-testid="confirm-duplicates"]',
          );
          if (button) button.click();
          else formRef.current?.requestSubmit();
        }}
      />
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

      <label className="flex items-start gap-2 text-sm" data-testid="customer-no-auto-place">
        <input
          type="checkbox"
          name="noAutoPlace"
          value="1"
          defaultChecked={Boolean(initial.noAutoPlace)}
          className="mt-1"
        />
        <span>
          <span className="font-medium">לא לשיבוץ אוטומטי</span>
          <span className="block text-xs text-on-surface-variant">
            המודעות של הלקוח הזה ישובצו רק ביד. השיבוץ האוטומטי ידלג עליהן וישאיר אותן ברשימה.
          </span>
        </span>
      </label>

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
      {shown.length ? (
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
            {shown.map((d) => (
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

/** "Save anyway?" — one click to confirm, listing exactly what repeats. */
function DuplicateConfirm({
  open,
  items,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  items: Array<{ customerId: string; text: string }>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => (o ? null : onCancel())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid="duplicates-dialog"
          className="fixed inset-x-0 top-1/2 z-50 mx-auto w-[min(30rem,calc(100vw-2rem))] -translate-y-1/2 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-2"
        >
          <DialogPrimitive.Title className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold">
            <AlertTriangle className="size-5 text-status-warning-fg" aria-hidden />
            הפרטים האלה כבר קיימים אצל לקוח אחר
          </DialogPrimitive.Title>
          <DialogPrimitive.Description asChild>
            <ul className="mb-4 list-inside list-disc space-y-1 text-sm text-on-surface-variant">
              {items.map((d) => (
                <li key={d.text}>{d.text}</li>
              ))}
            </ul>
          </DialogPrimitive.Description>
          <div className="flex gap-3 border-t border-outline-variant pt-4">
            <Button type="button" onClick={onConfirm} data-testid="duplicates-dialog-confirm">
              כן, יש יותר מלקוח אחד עם הפרטים האלה — לשמור
            </Button>
            <Button type="button" variant="ghost" onClick={onCancel}>
              חזרה לטופס
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
