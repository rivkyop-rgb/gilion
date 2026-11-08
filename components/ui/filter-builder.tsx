"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";

export type FilterField =
  | {
      /** The URL parameter the filter is carried in. */
      key: string;
      label: string;
      kind: "select";
      options: Array<{ value: string; label: string }>;
      /**
       * Type to search instead of a list. Always on for customers — the rule
       * everywhere a customer is picked (23/09/2026) — however few there are.
       */
      search?: boolean;
    }
  | { key: string; label: string; kind: "date" };

/** Above this many options any select becomes type-to-search, `search` or not. */
const SEARCH_ABOVE = 12;

/**
 * "+ הוספת סינון": pick a field, pick a value, and it becomes a chip — then
 * "+" again for the next one. Every filter is AND-ed with the others.
 *
 * The URL stays the whole state, as on every list in the product: a chip is a
 * query parameter, removing it removes the parameter, and a reload or a shared
 * link lands on the same rows. Navigation is `router.push(..., { scroll:
 * false })`, so adding a filter does not throw the reader back to the top.
 *
 * `keep` is every parameter this bar does NOT own (the status chips above it,
 * the dashboard's drill-down) — adding a filter must not silently drop them.
 */
export function FilterBuilder({
  basePath,
  fields,
  values,
  keep = {},
  testId = "filter-builder",
}: {
  basePath: string;
  fields: FilterField[];
  /** The active value of each field, by key — "" / absent when not set. */
  values: Record<string, string | undefined>;
  keep?: Record<string, string | undefined>;
  testId?: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  /** The chip being changed, when the panel was opened from one (08/11/2026). */
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [fieldKey, setFieldKey] = useState("");
  const [value, setValue] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const go = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, ...next })) {
      if (v && v !== "all") q.set(k, v);
    }
    const query = q.toString();
    router.push(query ? `${basePath}?${query}` : basePath, { scroll: false });
  };

  const active = fields.filter((f) => values[f.key]);
  const available = fields.filter((f) => !values[f.key]);
  // The field list while editing a chip: that field, plus anything unused —
  // changing "עיתון: א" to "לקוח: ב" is also a change.
  const choosable = editingKey
    ? fields.filter((f) => f.key === editingKey || !values[f.key])
    : available;
  const field = fields.find((f) => f.key === fieldKey);

  const labelOf = (f: FilterField, v: string) =>
    f.kind === "select" ? (f.options.find((o) => o.value === v)?.label ?? v) : v;

  // Clicking away closes the picker, as any popover does.
  useEffect(() => {
    if (!adding) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setAdding(false);
        setEditingKey(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [adding]);

  const add = () => {
    if (!field || !value) return;
    const next: Record<string, string | undefined> = { ...values, [field.key]: value };
    if (editingKey && editingKey !== field.key) next[editingKey] = undefined;
    go(next);
    close();
  };

  const close = () => {
    setAdding(false);
    setEditingKey(null);
    setFieldKey("");
    setValue("");
  };

  /** "עיתון: X" is clicked to become "עיתון: Y" (user, 08/11/2026). */
  const edit = (f: FilterField) => {
    setEditingKey(f.key);
    setFieldKey(f.key);
    setValue(values[f.key] ?? "");
    setAdding(true);
  };

  return (
    <div
      ref={rootRef}
      className="relative mb-4 flex flex-wrap items-center gap-2"
      data-testid={testId}
    >
      <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant">
        <Filter className="size-3.5" aria-hidden />
        סינון
      </span>

      {active.map((f) => (
        <span
          key={f.key}
          data-testid={`filter-chip-${f.key}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary/30 bg-status-info-bg ps-3 pe-1 text-sm text-status-info-fg"
        >
          <button
            type="button"
            onClick={() => edit(f)}
            data-testid={`filter-edit-${f.key}`}
            title="לחיצה לשינוי"
            aria-label={`שינוי הסינון ${f.label}`}
            className="inline-flex items-center gap-1.5 rounded-full underline-offset-2 hover:underline"
          >
            <span className="text-xs opacity-80">{f.label}:</span>
            <span className="font-medium">
              {f.kind === "date" ? <Ltr>{values[f.key]}</Ltr> : labelOf(f, values[f.key]!)}
            </span>
          </button>
          <button
            type="button"
            aria-label={`הסרת הסינון ${f.label}`}
            data-testid={`filter-remove-${f.key}`}
            onClick={() => go({ ...values, [f.key]: undefined })}
            className="rounded-full p-1 hover:bg-surface-container-lowest"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}

      {available.length > 0 ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid={`${testId}-add`}
          onClick={() => {
            if (adding) return close();
            setEditingKey(null);
            setFieldKey("");
            setValue("");
            setAdding(true);
          }}
          aria-expanded={adding && !editingKey}
        >
          <Plus className="size-4" />
          {active.length === 0 ? "הוספת סינון" : "סינון נוסף"}
        </Button>
      ) : null}

      {active.length > 1 ? (
        <button
          type="button"
          onClick={() => go(Object.fromEntries(active.map((f) => [f.key, undefined])))}
          className="text-xs text-on-surface-variant underline"
        >
          ניקוי הכל
        </button>
      ) : null}

      {/* An overlay, not a row that opens in the flow: it must not push the
          table down under the pointer (CLAUDE.md). */}
      {adding ? (
        <div
          className="absolute top-full z-30 mt-1 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-elevation-2"
          data-testid={`${testId}-panel`}
        >
          <label className="text-xs text-on-surface-variant">
            לפי מה לסנן
            <select
              data-testid={`${testId}-field`}
              value={fieldKey}
              onChange={(e) => {
                setFieldKey(e.target.value);
                setValue("");
              }}
              className="mt-1 h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface"
            >
              <option value="">בחרי…</option>
              {choosable.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>

          {field ? (
            <div className="text-xs text-on-surface-variant">
              {field.label}
              <div className="mt-1">
                {field.kind === "date" ? (
                  <Input
                    type="date"
                    dir="ltr"
                    data-testid={`${testId}-value`}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                ) : field.search || field.options.length > SEARCH_ABOVE ? (
                  <Combobox
                    key={`${field.key}-${editingKey ?? ""}`}
                    name={`fb-${field.key}`}
                    testId={`${testId}-value`}
                    options={field.options}
                    defaultValue={editingKey === field.key ? value : ""}
                    onChange={setValue}
                    placeholder="הקלידי כדי לחפש…"
                  />
                ) : (
                  <select
                    data-testid={`${testId}-value`}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-sm text-on-surface"
                  >
                    <option value="">בחרי…</option>
                    {field.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!field || !value}
              onClick={add}
              data-testid={`${testId}-apply`}
            >
              {editingKey ? "עדכון" : "הוספה"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={close}>
              ביטול
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
