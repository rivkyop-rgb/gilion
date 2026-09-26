"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";

import { InlineError } from "@/components/states";
import { MAIL_CLIENT_LABELS, type MailClient } from "@/lib/domain/mail-link";
import { cn } from "@/lib/utils";
import { setMailClientAction } from "./mail-client-actions";

const HINT: Record<MailClient, string> = {
  gmail: "נפתחת לשונית חדשה של Gmail עם ההודעה כתובה, בחשבון שמחובר בדפדפן.",
  mailto: "נפתחת תוכנת המייל שמותקנת במחשב (Outlook וכדומה).",
};

/** Where email links open — saved on click, like the other panel toggles. */
export function MailClientForm({ current }: { current: MailClient }) {
  const [value, setValue] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  const choose = (next: MailClient) =>
    start(async () => {
      setError(null);
      setValue(next);
      const result = await setMailClientAction(next);
      if (result.message) {
        setError(result.message);
        setValue(current);
      } else router.refresh();
    });

  return (
    <section
      className="mb-8 max-w-2xl rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1"
      data-testid="mail-client-setting"
    >
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <Mail className="size-4" aria-hidden />
        איפה נפתחים קישורי מייל
      </h2>
      <p className="mb-3 text-xs text-on-surface-variant">
        בתזכורות, בכרטיס הלקוח ובכל מקום שמופיע מייל של לקוח.
      </p>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
        {(["gmail", "mailto"] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            disabled={busy}
            data-testid={`mail-client-${c}`}
            onClick={() => choose(c)}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-4 text-start transition",
              value === c
                ? "border-secondary bg-state-active/40"
                : "border-outline-variant hover:border-brand-gold",
            )}
          >
            <span className="font-semibold">{MAIL_CLIENT_LABELS[c]}</span>
            <span className="text-xs text-on-surface-variant">{HINT[c]}</span>
          </button>
        ))}
      </div>
      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </section>
  );
}
