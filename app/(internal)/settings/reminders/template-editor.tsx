"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, MessageSquareText, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import {
  REMINDER_FIELDS,
  REMINDER_SAMPLE,
  fillReminder,
  unknownFields,
} from "@/lib/domain/reminders";
import { saveReminderTemplateAction } from "./template-actions";

/**
 * The reminder wording, where the reminders are configured (27/09/2026).
 *
 * Fields are inserted at the cursor as {name} — the chips are the list of what
 * exists, so nobody has to remember a spelling — and anything in braces that
 * is not a field is named before saving, because a typo would otherwise reach
 * the customer as "{לקחו}". The preview is the message with sample data, the
 * way it opens in WhatsApp.
 *
 * Controlled — and read-only until hydrated. Text typed into the server's
 * textarea before React took over was MERGED with the saved wording at
 * hydration ("שלום " + the whole old text), and the chip then went into the
 * merged text. Adopting the DOM value on mount cannot help: by then the merge
 * has happened. A box that cannot be typed into until it is live can: people
 * and Playwright's `fill` both wait for it to become editable (29/09/2026,
 * reminder-template.spec — same family as `adoptTypedDate` in CLAUDE.md).
 */
export function ReminderTemplateEditor({
  current,
  fallback,
  maxLength,
}: {
  /** What is in force now — the saved wording or the default. */
  current: string;
  fallback: string;
  maxLength: number;
}) {
  const [text, setText] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // false on the server and during hydration, true from the first client
  // render after it — no effect and no extra render to find out.
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );

  const unknown = unknownFields(text);
  const dirty = text !== current;

  const insert = (key: string) => {
    const area = areaRef.current;
    const token = `{${key}}`;
    const at = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? at;
    const next = text.slice(0, at) + token + text.slice(end);
    setText(next);
    setSaved(false);
    // Back to the textarea with the cursor after what was inserted.
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(at + token.length, at + token.length);
    });
  };

  const save = (value: string) =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await saveReminderTemplateAction(value);
      if (result.message) setError(result.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <section
      className="mt-6 max-w-3xl rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1"
      data-testid="reminder-template-editor"
    >
      <h2 className="mb-1 flex items-center gap-2 font-serif text-xl font-semibold">
        <MessageSquareText className="size-5" aria-hidden />
        נוסח התזכורת
      </h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        זה הטקסט שנפתח בוואטסאפ ובמייל ממסך התזכורות. לחיצה על שדה מכניסה אותו במקום שבו עומד הסמן,
        והוא מתמלא לבד בכל תזכורת.
      </p>

      <div className="mb-2 flex flex-wrap gap-1.5" data-testid="reminder-fields">
        {REMINDER_FIELDS.map((f) => (
          <button
            key={f.key}
            type="button"
            title={`${f.label} — למשל: ${f.sample}`}
            data-testid={`insert-field-${f.key}`}
            onClick={() => insert(f.key)}
            className="rounded-full border border-outline-variant bg-surface-container px-2.5 py-1 text-xs hover:border-primary hover:bg-status-info-bg"
          >
            {`{${f.key}}`}
          </button>
        ))}
      </div>

      <textarea
        ref={areaRef}
        readOnly={!hydrated}
        aria-busy={!hydrated}
        rows={7}
        maxLength={maxLength}
        value={text}
        data-testid="reminder-template"
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        className="w-full rounded-lg border border-outline-variant bg-surface-container p-3 text-sm leading-6 outline-none focus:border-primary"
      />
      <p className="mt-1 text-xs text-on-surface-variant">
        {text.length} / {maxLength} תווים
      </p>

      {unknown.length > 0 ? (
        <p
          data-testid="reminder-unknown-fields"
          className="mt-3 flex items-start gap-2 rounded-lg bg-status-warning-bg px-3 py-2 text-sm text-status-warning-fg"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {unknown.map((u) => `{${u}}`).join(", ")} — אין שדה בשם הזה, והוא יישלח ללקוח כמו שהוא.
            בחרי שדה מהרשימה למעלה.
          </span>
        </p>
      ) : null}

      <div className="mt-4">
        <p className="mb-1 text-xs font-medium text-on-surface-variant">
          כך זה ייראה (עם נתוני דוגמה):
        </p>
        <p
          data-testid="reminder-template-preview"
          className="whitespace-pre-wrap rounded-lg border border-dashed border-outline-variant bg-surface-container-low p-3 text-sm"
        >
          {fillReminder(text, REMINDER_SAMPLE) || "—"}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          disabled={busy || !dirty}
          onClick={() => save(text)}
          data-testid="save-reminder-template"
        >
          {busy ? "שומרת…" : "שמירת הנוסח"}
        </Button>
        {text !== fallback ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setText(fallback);
              save("");
            }}
            data-testid="reset-reminder-template"
          >
            <RotateCcw className="size-4" />
            חזרה לנוסח ברירת המחדל
          </Button>
        ) : null}
        {saved ? (
          <span
            role="status"
            className="text-sm text-status-success-fg"
            data-testid="reminder-template-saved"
          >
            נשמר. מעכשיו התזכורות נפתחות בנוסח הזה.
          </span>
        ) : null}
      </div>
      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </section>
  );
}

/** Hydration never changes back, so there is nothing to subscribe to. */
function noSubscription() {
  return () => {};
}
