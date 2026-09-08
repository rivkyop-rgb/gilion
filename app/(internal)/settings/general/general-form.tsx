"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PanelForm } from "@/components/settings/panel-form";
import {
  CURRENCIES,
  CURRENCY_SYMBOLS,
  DATE_FORMATS,
  type Currency,
} from "@/lib/domain/business-settings";
import type { BusinessSettings } from "@/lib/data/business-settings";
import { updateGeneralAction } from "../business-settings-actions";

/** What each format looks like on a date a person recognises. */
const SAMPLE = new Date(Date.UTC(2026, 11, 15));

function sampleFor(format: string): string {
  const dd = "15";
  const mm = "12";
  const yyyy = "2026";
  if (format === "dd.MM.yyyy") return `${dd}.${mm}.${yyyy}`;
  if (format === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
  return `${dd}/${mm}/${yyyy}`;
}

export function GeneralForm({
  settings,
  zones,
}: {
  settings: BusinessSettings;
  zones: string[];
}) {
  return (
    <PanelForm action={updateGeneralAction} group="general" resetLabel="איפוס להגדרות ברירת המחדל">
      {/* Carried so the action can validate the whole shape at once; the two
          fields themselves are edited on the branding screen, where the rest of
          the identity lives. */}
      <input type="hidden" name="displayName" value={settings.displayName ?? ""} />
      <input type="hidden" name="tagline" value={settings.tagline ?? ""} />

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
        <h2 className="mb-4 font-serif text-lg font-semibold">פרטי התקשרות</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="contactPhone">טלפון</Label>
            <Input
              id="contactPhone"
              name="contactPhone"
              dir="ltr"
              defaultValue={settings.contactPhone ?? ""}
              data-testid="contact-phone"
            />
          </div>
          <div>
            <Label htmlFor="contactEmail">מייל</Label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              dir="ltr"
              defaultValue={settings.contactEmail ?? ""}
              data-testid="contact-email"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="contactAddress">כתובת</Label>
            <Input
              id="contactAddress"
              name="contactAddress"
              defaultValue={settings.contactAddress ?? ""}
              data-testid="contact-address"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          כל השדות אופציונליים. עסק שעוד לא מילא אותם אינו עסק לא תקין.
        </p>
      </section>

      <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
        <h2 className="mb-4 font-serif text-lg font-semibold">תצוגה</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="timezone">אזור זמן</Label>
            {/* A datalist and not a free-text field: a typo here is a wrong
                date on a printed page, and the list is the runtime's own. */}
            <Input
              id="timezone"
              name="timezone"
              list="timezone-options"
              dir="ltr"
              defaultValue={settings.timezone}
              data-testid="timezone"
            />
            <datalist id="timezone-options">
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </div>

          <div>
            <Label htmlFor="dateFormat">פורמט תאריך</Label>
            <select
              id="dateFormat"
              name="dateFormat"
              defaultValue={settings.dateFormat}
              data-testid="date-format"
              className="h-9 w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-2 text-sm"
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f} · {sampleFor(f)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="currency">מטבע</Label>
            <select
              id="currency"
              name="currency"
              defaultValue={settings.currency}
              data-testid="currency"
              className="h-9 w-full rounded-sm border border-outline-variant bg-surface-container-lowest px-2 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} · {CURRENCY_SYMBOLS[c as Currency]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-on-surface-variant">
          התאריך {SAMPLE.getUTCFullYear()} יוצג לפי הפורמט שנבחר. האחסון תמיד ב־UTC וההצגה לפי אזור
          הזמן שכאן — conventions.md §1.
        </p>
      </section>
    </PanelForm>
  );
}
