"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineError } from "@/components/states";
import { cn } from "@/lib/utils";
import type { CustomerType } from "@/lib/domain/customer";
import type { FormState } from "./actions";

export type CustomerFormValues = {
  customerType: CustomerType;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
};

const EMPTY: CustomerFormValues = {
  customerType: "casual",
  businessName: "",
  contactName: "",
  phone: "",
  email: "",
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
