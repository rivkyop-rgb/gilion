"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string; hint?: string };

/**
 * A text input that filters a list, for selects that outgrew scrolling.
 *
 * Built on a plain `<input>` rather than a combobox library because the whole
 * requirement is "type to narrow": the native `<select>` already loses at a few
 * hundred customers, and a headless library would arrive with a dependency,
 * a portal and a styling surface for behaviour that is one `filter()` call.
 *
 * The selected VALUE is carried by a hidden input, so the form still submits an
 * id while the visible field holds a human-readable name. That split is the
 * reason `<input list>` + `<datalist>` is not usable here — datalist submits
 * whatever text is shown.
 */
export function Combobox({
  name,
  options,
  defaultValue = "",
  placeholder = "הקלידי כדי לחפש…",
  emptyText = "אין תוצאות",
  id,
  required,
  testId,
  onChange,
}: {
  name: string;
  options: ComboboxOption[];
  defaultValue?: string;
  placeholder?: string;
  emptyText?: string;
  id?: string;
  required?: boolean;
  testId?: string;
  onChange?: (value: string) => void;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;

  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const labelOf = useMemo(() => {
    const byValue = new Map(options.map((o) => [o.value, o.label]));
    return (v: string) => byValue.get(v) ?? "";
  }, [options]);

  const [query, setQuery] = useState(() => labelOf(defaultValue));

  // While the list is open the text is a SEARCH TERM; once it closes it has to
  // go back to being the label of what is selected. Without this, abandoning a
  // search leaves a half-typed name sitting over a different selected id — the
  // field showing one customer and the form submitting another.
  const commit = (next: string) => {
    setValue(next);
    setQuery(labelOf(next));
    setActive(0);
    setOpen(false);
    onChange?.(next);
  };

  /** Typing is the only thing that narrows the list, so it also resets the
      highlight — in the handler rather than an effect, because it is a
      consequence of the keystroke and not of the state that follows it. */
  const search = (text: string) => {
    setQuery(text);
    setActive(0);
    setOpen(true);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // An untouched field shows everything: opening the list must not require
    // typing first, or the control is worse than the select it replaced.
    if (!q || q === labelOf(value).toLowerCase()) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
    );
  }, [query, options, value, labelOf]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setQuery(labelOf(value));
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, value, labelOf]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return setOpen(true);
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return (next + filtered.length) % Math.max(filtered.length, 1);
      });
    } else if (e.key === "Enter") {
      // Only swallow Enter while choosing. Otherwise it must still submit.
      if (open && filtered[active]) {
        e.preventDefault();
        commit(filtered[active].value);
      }
    } else if (e.key === "Escape") {
      setQuery(labelOf(value));
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {/* The real form value. It carries no `required`: a hidden input is
          barred from constraint validation, so the attribute would look like a
          guard and enforce nothing. Emptiness is caught on the server, and
          callers that want a disabled submit use `onChange`. */}
      <input type="hidden" name={name} value={value} />

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-required={required}
          autoComplete="off"
          data-testid={testId}
          data-value={value}
          value={query}
          placeholder={placeholder}
          onChange={(e) => search(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container pe-16 ps-3 text-start text-sm outline-none focus:border-primary"
        />
        <div className="pointer-events-none absolute inset-y-0 end-2 flex items-center gap-1">
          {value ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="ניקוי הבחירה"
              className="pointer-events-auto rounded-full p-0.5 text-on-surface-variant hover:bg-surface-container-high"
              onClick={() => {
                commit("");
                inputRef.current?.focus();
              }}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
          <ChevronsUpDown className="size-4 text-on-surface-variant" />
        </div>
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          data-testid={testId ? `${testId}-list` : undefined}
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest py-1 shadow-elevation-2"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-on-surface-variant">{emptyText}</li>
          ) : (
            filtered.map((o, i) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  data-testid={`option-${o.value}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(o.value)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-start text-sm",
                    i === active ? "bg-surface-container" : "hover:bg-surface-container-low",
                  )}
                >
                  <Check
                    className={cn("size-4 shrink-0", o.value === value ? "" : "invisible")}
                    aria-hidden
                  />
                  <span className="grow">{o.label}</span>
                  {o.hint ? (
                    <span className="ltr-isolate text-xs text-on-surface-variant">{o.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
