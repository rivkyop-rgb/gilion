"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark, hasCustomBrand } from "@/components/brand/brand-mark";
import { PanelForm, ResetFieldButton } from "@/components/settings/panel-form";
import { BRAND_SLOTS, type BrandSlotSpec } from "@/lib/domain/business-settings";
import type { BusinessSettings } from "@/lib/data/business-settings";
import { updateBrandingAction } from "../business-settings-actions";

export function BrandingForm({
  settings,
  fallbackName,
}: {
  settings: BusinessSettings;
  fallbackName: string;
}) {
  return (
    <PanelForm action={updateBrandingAction} group="branding" resetLabel="איפוס כל המותג">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="displayName">שם תצוגה</Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={settings.displayName ?? ""}
            placeholder={fallbackName}
            data-testid="brand-display-name"
          />
          <p className="mt-1 text-xs text-on-surface-variant">
            ריק = שם העסק ({fallbackName}). מופיע לצד הסימן בסרגל הצד.
          </p>
        </div>

        <div>
          <Label htmlFor="tagline">משפט מלווה</Label>
          <Input
            id="tagline"
            name="tagline"
            defaultValue={settings.tagline ?? ""}
            placeholder="ניהול פרסום בעיתון"
            data-testid="brand-tagline"
          />
        </div>
      </div>

      <div className="space-y-4">
        {BRAND_SLOTS.map((spec) => (
          <SlotCard key={spec.slot} spec={spec} settings={settings} />
        ))}
      </div>
    </PanelForm>
  );
}

/**
 * One asset, with the preview that actually answers the question.
 *
 * A logo is shown at 40px in a collapsed rail, at 80px expanded, and full size
 * on the login screen — and it is shown on white in the sidebar and on the dark
 * primary field at login. A single large preview hides exactly the failure that
 * matters: a mark that is legible at 240px and a smudge at 40, or a dark logo
 * that vanishes on the dark half of the login screen.
 */
function SlotCard({ spec, settings }: { spec: BrandSlotSpec; settings: BusinessSettings }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const custom = hasCustomBrand(spec.slot, settings);

  return (
    <div
      data-testid={`brand-slot-${spec.slot}`}
      className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold">{spec.label}</h2>
          <p className="text-sm text-on-surface-variant">{spec.hint}</p>
        </div>
        {custom ? (
          <ResetFieldButton
            group="branding"
            fieldKey={spec.slot}
            label={`החזרת ${spec.label} לברירת המחדל`}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-6">
        <div className="min-w-56 flex-1">
          <input
            type="file"
            name={`file_${spec.slot}`}
            accept={spec.types.map((t) => `.${t}`).join(",")}
            data-testid={`brand-file-${spec.slot}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              setChosen(file ? URL.createObjectURL(file) : null);
            }}
            className="w-full rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-3 text-sm file:me-3 file:rounded-sm file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-on-primary"
          />
          <p className="mt-1 text-xs text-on-surface-variant">
            {spec.types.map((t) => t.toUpperCase()).join(" · ")} · עד{" "}
            {spec.maxBytes >= 1024 * 1024
              ? `${spec.maxBytes / (1024 * 1024)} MB`
              : `${spec.maxBytes / 1024} KB`}
          </p>

          {custom ? (
            <label className="mt-2 flex items-center gap-2 text-sm text-on-surface-variant">
              <input type="checkbox" name={`clear_${spec.slot}`} value="1" />
              להסיר ולחזור לקובץ ברירת המחדל
            </label>
          ) : null}
        </div>

        {/* Light beside dark, small beside large — see the note above. */}
        <div className="flex items-end gap-4">
          <Swatch tone="light">
            <Preview src={chosen} slot={spec} settings={settings} size={40} />
          </Swatch>
          <Swatch tone="light">
            <Preview src={chosen} slot={spec} settings={settings} size={80} />
          </Swatch>
          <Swatch tone="dark">
            <Preview src={chosen} slot={spec} settings={settings} size={80} />
          </Swatch>
        </div>
      </div>
    </div>
  );
}

function Swatch({ tone, children }: { tone: "light" | "dark"; children: React.ReactNode }) {
  return (
    <div
      className={
        tone === "dark"
          ? "flex items-center justify-center rounded-lg bg-primary p-2"
          : "flex items-center justify-center rounded-lg bg-surface-container-lowest p-2 ring-1 ring-outline-variant"
      }
    >
      {children}
    </div>
  );
}

function Preview({
  src,
  slot,
  settings,
  size,
}: {
  src: string | null;
  slot: BrandSlotSpec;
  settings: BusinessSettings;
  size: number;
}) {
  // A file the admin just picked has not been uploaded yet, so it is previewed
  // straight from the browser's own object URL. Anything else goes through
  // BrandMark, which is the only thing in the product that knows where a stored
  // logo lives.
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" style={{ width: size, height: size }} className="object-contain" />
    );
  }
  return (
    <BrandMark
      slot={slot.slot}
      keys={settings}
      width={size}
      height={size}
      className="object-contain"
    />
  );
}
