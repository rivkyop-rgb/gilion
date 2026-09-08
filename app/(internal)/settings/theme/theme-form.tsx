"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";
import { PanelForm, ResetFieldButton } from "@/components/settings/panel-form";
import {
  contrastWarnings,
  cssVariables,
  isValidHex,
  mergeTokens,
  normalizeHex,
  THEME_TOKENS,
  type ColorOverrides,
} from "@/lib/domain/theme-tokens";
import { updateThemeAction } from "../business-settings-actions";

const GROUP_LABELS = { brand: "מותג", status: "צבעי סטטוס" } as const;

export function ThemeForm({ colors }: { colors: ColorOverrides }) {
  // Local state so the preview moves with the picker. The server re-reads the
  // same submitted values and re-derives everything — this is UX, never the
  // validation boundary (conventions.md §9).
  const [values, setValues] = useState<Record<string, string>>(() => mergeTokens(colors));

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  const overrides: ColorOverrides = Object.fromEntries(
    Object.entries(values).filter(([, v]) => isValidHex(v)),
  );
  const warnings = contrastWarnings(overrides);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <PanelForm
        action={updateThemeAction}
        group="theme"
        resetLabel="איפוס כל הצבעים"
        onReset={() => setValues(mergeTokens({}))}
      >
        {(["brand", "status"] as const).map((group) => (
          <section key={group}>
            <h2 className="mb-2 font-serif text-lg font-semibold">{GROUP_LABELS[group]}</h2>
            <div className="divide-y divide-outline-variant rounded-xl border border-outline-variant bg-surface-container-lowest">
              {THEME_TOKENS.filter((t) => t.group === group).map((token) => {
                const value = values[token.key] ?? token.default;
                const changed = normalizeHex(value) !== normalizeHex(token.default);
                return (
                  <div key={token.key} className="flex items-center gap-3 p-3">
                    <input
                      type="color"
                      aria-label={token.label}
                      value={isValidHex(value) ? normalizeHex(value) : normalizeHex(token.default)}
                      onChange={(e) => set(token.key, e.target.value)}
                      data-testid={`swatch-${token.key}`}
                      className="size-9 shrink-0 cursor-pointer rounded-sm border border-outline-variant bg-transparent"
                    />

                    <div className="min-w-0 flex-1">
                      <label htmlFor={`hex-${token.key}`} className="block text-sm font-medium">
                        {token.label}
                      </label>
                      <p className="truncate text-xs text-on-surface-variant">
                        ברירת מחדל <Ltr>{token.default}</Ltr>
                      </p>
                    </div>

                    {/* The field the FORM posts. The colour input above is a
                        convenience on top of it — a hex code is what a brand
                        book actually says, and it is what can be pasted. */}
                    <Input
                      id={`hex-${token.key}`}
                      name={token.key}
                      dir="ltr"
                      value={value}
                      onChange={(e) => set(token.key, e.target.value)}
                      data-testid={`hex-${token.key}`}
                      aria-invalid={!isValidHex(value)}
                      className="w-28 font-mono"
                    />

                    {changed ? (
                      <ResetFieldButton
                        group="theme"
                        fieldKey={token.key}
                        label={`החזרת ${token.label} לברירת המחדל`}
                        onReset={() => set(token.key, normalizeHex(token.default))}
                      />
                    ) : (
                      <span className="w-6" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </PanelForm>

      <ThemePreview values={values} warnings={warnings.map((w) => w.message)} />
    </div>
  );
}

/**
 * What the palette looks like before it is saved.
 *
 * Rendered inside a div carrying the same `--gilion-*` variables the layout
 * writes after a save, so the preview and the real thing cannot disagree: they
 * are the same tokens resolved the same way, not a hand-painted mock-up.
 */
function ThemePreview({
  values,
  warnings,
}: {
  values: Record<string, string>;
  warnings: string[];
}) {
  const style = cssVariables(
    Object.fromEntries(Object.entries(values).filter(([, v]) => isValidHex(v))),
  );

  return (
    <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
      <h2 className="font-serif text-lg font-semibold">תצוגה מקדימה</h2>

      <div
        data-testid="theme-preview"
        style={style}
        className="space-y-4 rounded-xl border border-outline-variant bg-surface p-4"
      >
        <div className="rounded-lg bg-surface-container-lowest p-3 ring-1 ring-outline-variant">
          <div className="mb-2 font-serif text-base font-bold text-primary">סרגל צד</div>
          <div className="rounded-sm bg-state-active px-2 py-1 text-sm font-medium text-on-surface">
            פריט פעיל
          </div>
          <div className="px-2 py-1 text-sm text-on-surface-variant">פריט רגיל</div>
        </div>

        <div className="rounded-lg bg-primary p-4">
          <p className="text-xs text-on-primary opacity-80">סה״כ לחיוב</p>
          <p className="font-serif text-2xl font-bold text-on-primary">
            <Ltr>₪128,400</Ltr>
          </p>
          <p className="mt-1 text-xs text-brand-gold">זהב המותג</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-status-success-bg px-2 py-0.5 text-xs font-medium text-status-success-fg">
            שולם
          </span>
          <span className="rounded-full bg-status-warning-bg px-2 py-0.5 text-xs font-medium text-status-warning-fg">
            חסרה מודעה
          </span>
          <span className="rounded-full bg-status-error-bg px-2 py-0.5 text-xs font-medium text-status-error-fg">
            נדחתה
          </span>
          <span className="rounded-full bg-status-debt-bg px-2 py-0.5 text-xs font-medium text-status-debt-fg">
            חוב
          </span>
          <span className="rounded-full bg-status-neutral-bg px-2 py-0.5 text-xs font-medium text-status-neutral-fg">
            טיוטה
          </span>
        </div>
      </div>

      {/*
        Live, so a bad pair is visible while the picker is still open — the
        saved message repeats it, but by then the choice already happened.
        A warning, never a block: it is the admin's own brand (stage 11).
      */}
      {warnings.length > 0 ? (
        <ul
          data-testid="contrast-warnings"
          className="space-y-2 rounded-lg bg-status-warning-bg p-3 text-xs text-status-warning-fg"
        >
          {warnings.map((w) => (
            <li key={w} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </aside>
  );
}
