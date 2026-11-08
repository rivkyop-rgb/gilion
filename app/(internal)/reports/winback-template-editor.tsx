"use client";

import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, MessageSquareText, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import { fillTemplate } from "@/lib/domain/customer-messages";
import { saveWinbackTemplateAction } from "../settings/reminders/template-actions";

const FIELDS = ["לקוח", "עיתון", "תאריך אחרון", "גודל", "עסק", "טלפון העסק"] as const;

/**
 * The winback message, edited where it is sent from (08/11/2026: "לאפשר לי
 * לערוך פעם אחת את ההודעה שנשלחת לנבחרים … וזה ישמש לי לתבנית להבא").
 *
 * Folded by default — the table is what the tab is for. Saving writes the same
 * override the admin panel's texts screen edits, so there is one wording, and
 * every WhatsApp and mail link on the tab opens with it from then on. The
 * preview is filled from the first customer on screen, not from sample data:
 * it is the message that customer would get.
 *
 * Read-only until hydrated, for the reason written on the reminder editor.
 */
export function WinbackTemplateEditor({
  current,
  fallback,
  maxLength,
  sample,
  mayEdit,
}: {
  current: string;
  fallback: string;
  maxLength: number;
  sample: Record<string, string> | null;
  mayEdit: boolean;
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
    (k) => !(FIELDS as readonly string[]).includes(k),
  );
  const dirty = text !== current;

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
      const result = await saveWinbackTemplateAction(value);
      if (result.message) setError(result.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <details
      className="mb-4 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1"
      data-testid="winback-template-editor"
    >
      <summary className="flex cursor-pointer items-center gap-2 p-4 text-sm font-semibold">
        <MessageSquareText className="size-4" aria-hidden />
        נוסח ההודעה ללקוחות
        <span className="font-normal text-on-surface-variant">
          — {mayEdit ? "לחיצה לעריכה. הנוסח שנשמר ישמש מעכשיו לכל ההודעות" : "רק מנהל יכול לשנות"}
        </span>
      </summary>
      <div className="border-t border-outline-variant p-4">
        {mayEdit ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {FIELDS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => insert(f)}
                data-testid={`winback-insert-${f}`}
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
              data-testid="winback-template"
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
              data-testid="winback-template-preview"
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
              data-testid="save-winback-template"
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
                data-testid="winback-template-saved"
              >
                נשמר. כל ההודעות בטבלה נפתחות עכשיו בנוסח הזה.
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
