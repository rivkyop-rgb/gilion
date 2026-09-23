"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PanelForm } from "@/components/settings/panel-form";
import type { BusinessSettings } from "@/lib/data/business-settings";
import { updateGeneralAction } from "../business-settings-actions";

export function GeneralForm({ settings }: { settings: BusinessSettings }) {
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
    </PanelForm>
  );
}
