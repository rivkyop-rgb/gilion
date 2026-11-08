"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, MessageSquareText, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import { fillTemplate } from "@/lib/domain/customer-messages";
import { cn } from "@/lib/utils";
import { saveMessageTemplateAction } from "@/app/(internal)/settings/reminders/template-actions";

/**
 * A customer message wording with its fields and a preview (08/11/2026).
 *
 * Used in two places that write the same override: Settings ← הודעות ללקוחות,
 * where every wording sits together, and folded above the screen the message
 * is sent from ("לאפשר לי לערוך פעם אחת את ההודעה שנשלחת לנבחרים … וזה ישמש
 * לי לתבנית להבא"). The preview is filled from `sample` — on the sending
 * screen, the first customer on it: the message that customer would get.
 *
 * Read-only until hydrated, for the reason written on the reminder editor.
 */
export function MessageTemplateEditor({
  templateKey,
  title,
  hint,
  fields,
  current,
  fallback,
  maxLength,
  sample,
  mayEdit,
  folded = false,
}: {
  templateKey: "winback_template" | "misfit_template";
  title: string;
  /** Where the message is sent from, said under the title. */
  hint: string;
  fields: readonly string[];
  current: string;
  fallback: string;
  maxLength: number;
  sample: Record<string, string> | null;
  mayEdit: boolean;
  /** Closed until clicked — on a screen whose table is the point. */
  folded?: boolean;
}) {
  const [text, setText] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const unknown = [...new Set([...text.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!.trim()))].filter(
    (k) => !fields.includes(k),
  );
  const dirty = text !== current;
  // winback-template / misfit-template — the testids the specs already use.
  const prefix = templateKey.replace("_", "-");

  const insert = (key: string) => {
    const area = areaRef.current;
    const token = `{${key}}`;
    const at = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? at;
    setText(text.slice(0, at) + token + text.slice(end));
    setSaved(false);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  const save = (value: string) =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await saveMessageTemplateAction(templateKey, value);
      if (result.message) setError(result.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <details
      open={folded ? undefined : true}
      className="mb-4 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1"
      data-testid={`${prefix}-editor`}
    >
      <summary
        className={cn(
          "flex items-center gap-2 p-4 text-sm font-semibold",
          folded ? "cursor-pointer" : "pointer-events-none list-none",
        )}
        // Open for good on the settings screen: a summary there would only
        // let somebody fold away the thing they came to edit.
        tabIndex={folded ? undefined : -1}
      >
        <MessageSquareText className="size-4" aria-hidden />
        {title}
        <span className="font-normal text-on-surface-variant">
          — {mayEdit ? hint : "רק מנהל יכול לשנות"}
        </span>
      </summary>
      <div className="border-t border-outline-variant p-4">
        {mayEdit ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {fields.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => insert(f)}
                data-testid={`${prefix}-insert-${f}`}
                className="rounded-full border border-outline-variant bg-surface-container px-2.5 py-1 text-xs hover:border-primary hover:bg-status-info-bg"
              >
                {`{${f}}`}
              </button>
            ))}
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <textarea
              ref={areaRef}
              readOnly={!hydrated || !mayEdit}
              aria-label="נוסח ההודעה"
              rows={7}
              maxLength={maxLength}
              value={text}
              data-testid={prefix}
              onChange={(e) => {
                setText(e.target.value);
                setSaved(false);
              }}
              className="w-full rounded-lg border border-outline-variant bg-surface-container p-3 text-sm leading-6 outline-none focus:border-primary"
            />
            <p className="mt-1 text-xs text-on-surface-variant">
              {text.length} / {maxLength} תווים
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-on-surface-variant">
              {sample ? `כך זה יגיע ל${sample["לקוח"]}:` : "כך זה ייראה:"}
            </p>
            <p
              data-testid={`${prefix}-preview`}
              className="whitespace-pre-wrap rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-3 text-sm"
            >
              {(sample ? fillTemplate(text, sample) : text) || "—"}
            </p>
          </div>
        </div>

        {unknown.length > 0 ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {unknown.map((u) => `{${u}}`).join(", ")} — אין שדה בשם הזה, והוא יישלח ללקוח כמו
              שהוא.
            </span>
          </p>
        ) : null}

        {mayEdit ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              disabled={busy || !dirty}
              onClick={() => save(text)}
              data-testid={`save-${prefix}`}
            >
              {busy ? "שומר…" : "שמירה כתבנית"}
            </Button>
            {text !== fallback ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setText(fallback);
                  save("");
                }}
              >
                <RotateCcw className="size-4" />
                חזרה לנוסח ברירת המחדל
              </Button>
            ) : null}
            {saved ? (
              <span
                role="status"
                className="text-sm text-status-success-fg"
                data-testid={`${prefix}-saved`}
              >
                נשמר. מעכשיו ההודעה נפתחת בנוסח הזה.
              </span>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="mt-3">
            <InlineError>{error}</InlineError>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function noSubscription() {
  return () => {};
}
