"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PanelForm, ResetFieldButton } from "@/components/settings/panel-form";
import { TEXT_FIELDS, type TextOverrides } from "@/lib/domain/business-settings";
import { updateTextsAction } from "../business-settings-actions";

export function TextsForm({ texts }: { texts: TextOverrides }) {
  return (
    <PanelForm action={updateTextsAction} group="texts" resetLabel="איפוס כל הטקסטים">
      <div className="space-y-4">
        {TEXT_FIELDS.map((field) => {
          const value = texts[field.key] ?? "";
          return (
            <div
              key={field.key}
              data-testid={`text-field-${field.key}`}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <Label htmlFor={field.key}>{field.label}</Label>
                  <p className="text-xs text-on-surface-variant">{field.where}</p>
                </div>
                {value ? (
                  <ResetFieldButton
                    group="texts"
                    fieldKey={field.key}
                    label={`החזרת "${field.label}" לברירת המחדל`}
                  />
                ) : null}
              </div>

              {field.multiline ? (
                <textarea
                  id={field.key}
                  name={field.key}
                  rows={3}
                  maxLength={field.maxLength}
                  defaultValue={value}
                  /* The placeholder IS the default, verbatim — that is what
                     makes an empty field readable as a choice rather than as
                     something nobody filled in. */
                  placeholder={field.default || "בלי טקסט"}
                  className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-sm"
                />
              ) : (
                <Input
                  id={field.key}
                  name={field.key}
                  maxLength={field.maxLength}
                  defaultValue={value}
                  placeholder={field.default || "בלי טקסט"}
                />
              )}

              <p className="mt-1 text-xs text-on-surface-variant">עד {field.maxLength} תווים</p>
            </div>
          );
        })}
      </div>
    </PanelForm>
  );
}
