"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/states";
import { setAutoPlaceSettingsAction } from "../../actions";

export type AutoPlaceTypeRow = {
  id: string;
  name: string;
  autoPlace: boolean;
  autoGrow: boolean;
};

/**
 * Auto-placement's rules for this newspaper (27/09/2026): which page types it
 * may place on, and which type it adds when the issue runs out of room. The
 * button on the board then just follows them — no question on every click.
 *
 * "None chosen" for the added type is a real answer: the inner type, found by
 * name (the same rule as the board's "+"), and the table says so.
 */
export function AutoPlaceSettings({
  newspaperId,
  types,
  readOnly,
}: {
  newspaperId: string;
  types: AutoPlaceTypeRow[];
  readOnly: boolean;
}) {
  const [allowed, setAllowed] = useState(
    () => new Set(types.filter((t) => t.autoPlace).map((t) => t.id)),
  );
  const [grow, setGrow] = useState<string | null>(types.find((t) => t.autoGrow)?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();

  const toggle = (id: string) => {
    setSaved(false);
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // A type auto-placement may not use cannot be the one it grows with.
    if (grow === id) setGrow(null);
  };

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const result = await setAutoPlaceSettingsAction(newspaperId, {
        autoPlaceTypeIds: [...allowed],
        growTypeId: grow,
      });
      if (result.message) setError(result.message);
      else {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <section
      className="mb-8 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-1"
      data-testid="auto-place-settings"
    >
      <h2 className="mb-1 flex items-center gap-2 font-serif text-xl font-semibold">
        <Wand2 className="size-5" aria-hidden />
        שיבוץ אוטומטי
      </h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        באילו סוגי עמודים השיבוץ האוטומטי מניח מודעות, ואיזה סוג עמוד הוא מוסיף כשאין מספיק מקום.
        מודעה ששובצה ביד בעמוד שסגור לשיבוץ אוטומטי נשארת במקומה.
      </p>

      <table className="w-full max-w-xl text-sm">
        <thead className="text-xs text-on-surface-variant">
          <tr>
            <th className="py-1 text-start font-medium">סוג עמוד</th>
            <th className="py-1 text-start font-medium">שיבוץ אוטומטי</th>
            <th className="py-1 text-start font-medium">נוסף כשחסר מקום</th>
          </tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.id} className="border-t border-outline-variant">
              <td className="py-2 font-medium">{t.name}</td>
              <td className="py-2">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={allowed.has(t.id)}
                  disabled={readOnly || busy}
                  data-testid={`auto-place-type-${t.name}`}
                  onChange={() => toggle(t.id)}
                  aria-label={`שיבוץ אוטומטי בעמודי ${t.name}`}
                />
              </td>
              <td className="py-2">
                <input
                  type="radio"
                  name="auto-grow"
                  className="size-4 accent-primary"
                  checked={grow === t.id}
                  disabled={readOnly || busy || !allowed.has(t.id)}
                  data-testid={`auto-grow-type-${t.name}`}
                  onChange={() => {
                    setGrow(t.id);
                    setSaved(false);
                  }}
                  aria-label={`להוסיף עמודי ${t.name} כשחסר מקום`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {grow === null ? (
        <p className="mt-2 text-xs text-on-surface-variant">
          לא נבחר סוג להוספה — יתווספו עמודים מהסוג הפנימי.
        </p>
      ) : null}

      {!readOnly ? (
        <div className="mt-4 flex items-center gap-3">
          <Button disabled={busy} onClick={save} data-testid="save-auto-place">
            {busy ? "שומרת…" : "שמירת הגדרות השיבוץ"}
          </Button>
          {saved ? (
            <span
              role="status"
              className="text-sm text-status-success-fg"
              data-testid="auto-place-saved"
            >
              נשמר. השיבוץ האוטומטי יעבוד לפי זה.
            </span>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <InlineError>{error}</InlineError>
        </div>
      ) : null}
    </section>
  );
}
