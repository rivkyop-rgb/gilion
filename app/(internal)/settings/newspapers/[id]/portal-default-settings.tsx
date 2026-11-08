"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import { INNER_PAGE_TYPE_NAME } from "@/lib/domain/portal-request";
import { setPortalDefaultPageTypeAction } from "../../actions";

export type PortalDefaultTypeRow = { id: string; name: string; portalDefault: boolean };

/**
 * Where a portal request lands when the customer does not choose (08/11/2026).
 *
 * Before this, the server took the first page type by Hebrew name — "גב" — so
 * every request was filed and priced as the back page. The customer may still
 * choose another type; the office then calls them (the portal says so).
 */
export function PortalDefaultSettings({
  newspaperId,
  types,
  readOnly,
}: {
  newspaperId: string;
  types: PortalDefaultTypeRow[];
  readOnly: boolean;
}) {
  const fallback = types.find((t) => t.name === INNER_PAGE_TYPE_NAME)?.id ?? null;
  const [chosen, setChosen] = useState<string | null>(
    types.find((t) => t.portalDefault)?.id ?? fallback,
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await setPortalDefaultPageTypeAction(newspaperId, { pageTypeId: chosen });
      if (result.message) setError(result.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <section
      className="mb-8 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1"
      data-testid="portal-default-settings"
    >
      <h2 className="mb-1 flex items-center gap-2 font-serif text-xl font-semibold">
        <Globe className="size-5" aria-hidden />
        בקשות מהפורטל
      </h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        לאיזה סוג עמוד נכנסת בקשה של לקוח, כשהוא לא בוחר מיקום. לפי הסוג הזה מוצג לו המחיר. לקוח
        שבוחר סוג אחר מקבל הודעה שנציג מהמשרד ייצור איתו קשר.
      </p>
      <fieldset className="flex flex-wrap gap-4" disabled={readOnly || busy}>
        <legend className="sr-only">סוג העמוד לבקשות מהפורטל</legend>
        {types.map((t) => (
          <label key={t.id} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`portal-default-${newspaperId}`}
              checked={chosen === t.id}
              onChange={() => {
                setSaved(false);
                setChosen(t.id);
              }}
              data-testid={`portal-default-${t.name}`}
            />
            {t.name}
          </label>
        ))}
      </fieldset>
      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
      {readOnly ? null : (
        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" onClick={save} disabled={busy} data-testid="save-portal-default">
            {busy ? "שומר…" : "שמירה"}
          </Button>
          {saved ? (
            <span className="text-sm text-status-success-fg" role="status">
              נשמר
            </span>
          ) : null}
        </div>
      )}
    </section>
  );
}
