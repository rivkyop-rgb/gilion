"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The wording an admin set in the panel (`reminder_template`, stage 11).
 *
 * Shown here because this is the screen where somebody picks up the phone or
 * opens WhatsApp, and the field in the panel says so in as many words — it
 * described itself as "the wording copied when contacting the customer" and
 * until 23/09/2026 appeared in no screen at all.
 *
 * Copy rather than send: FR-11 keeps the MVP out of the sending business, and
 * a button that puts the sentence on the clipboard is the whole of what the
 * product can honestly offer.
 */
export function ReminderWording({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div
      data-testid="reminder-wording"
      className="mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">הנוסח שלך לפנייה</h2>
        <Button
          variant="secondary"
          size="sm"
          data-testid="copy-reminder-wording"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // A browser that refuses the clipboard is not an error worth a
              // dialog: the text is on screen and can be selected by hand.
            }
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "הועתק" : "העתקה"}
        </Button>
      </div>
      <p className="text-sm whitespace-pre-wrap text-on-surface-variant">{text}</p>
      <p className="mt-2 text-xs text-on-surface-variant">
        נקבע בהגדרות · טקסטים, וניתן לשינוי שם בלי מפתח.
      </p>
    </div>
  );
}
