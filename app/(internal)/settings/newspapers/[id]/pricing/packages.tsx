"use client";

import { useState, useTransition } from "react";
import { useFormActionState } from "@/components/use-form-action-state";
import { Plus, Trash2 } from "lucide-react";

import { formatPercent } from "@/lib/domain/ad-package";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InlineError } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import {
  createPackageAction,
  deletePackageAction,
  setPackageActiveAction,
  type FormState,
} from "../../../actions";

export type PackageRow = {
  id: string;
  name: string;
  minQuantity: number;
  discountPercent: number;
  active: boolean;
  /** How many order lines have already earned it — a used package is retired, not deleted. */
  used: number;
};

/**
 * Quantity discounts (backlog item 12).
 *
 * On the pricing tab and not on a tab of its own, because a package is a
 * statement about the price list rather than a thing in its own right: it is
 * the answer to "and what if they buy four", asked in the same breath as "what
 * does one cost".
 */
export function Packages({
  newspaperId,
  packages,
  readOnly,
}: {
  newspaperId: string;
  packages: PackageRow[];
  readOnly: boolean;
}) {
  const bound = createPackageAction.bind(null, newspaperId);
  const [state, action, pending, keepTypedOnError] = useFormActionState<FormState, FormData>(
    bound,
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const run = (act: () => Promise<FormState>) =>
    startTransition(async () => setError((await act()).message ?? null));

  return (
    <section className="mt-10">
      <h2 className="mb-1 font-serif text-xl font-semibold">חבילות פרסום</h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        הנחת כמות: מספר פרסומים <strong>באותו עיתון</strong> על הזמנה אחת מזכה באחוז הנחה על כל
        שורה. ההנחה נקבעת באישור ההזמנה ונשמרת — שינוי כאן לא נוגע בהזמנות שכבר אושרו.
      </p>

      {error ? <InlineError>{error}</InlineError> : null}

      {packages.length > 0 ? (
        <ul className="mb-4 space-y-2" data-testid="package-list">
          {packages.map((pkg) => (
            <li
              key={pkg.id}
              data-testid={`package-${pkg.id}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">
                  {pkg.name}
                  {pkg.active ? null : (
                    <Badge tone="neutral" className="ms-2">
                      לא בשימוש
                    </Badge>
                  )}
                </span>
                <span className="block text-sm text-on-surface-variant">
                  מ־<Ltr>{pkg.minQuantity}</Ltr> פרסומים ·{" "}
                  <Ltr>{formatPercent(pkg.discountPercent)}</Ltr> הנחה על כל שורה
                </span>
              </span>

              {readOnly ? null : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    data-testid={`package-toggle-${pkg.id}`}
                    onClick={() =>
                      run(() => setPackageActiveAction(newspaperId, pkg.id, !pkg.active))
                    }
                  >
                    {pkg.active ? "השבתה" : "הפעלה"}
                  </Button>
                  {pkg.used === 0 ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`מחיקת ${pkg.name}`}
                      data-testid={`package-delete-${pkg.id}`}
                      onClick={() => run(() => deletePackageAction(newspaperId, pkg.id))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : (
                    /* A package an approved order earned cannot be deleted: the
                       frozen percentage would survive and the name explaining
                       it would not. Retiring it stops it applying to new
                       orders, which is what "delete" was ever wanted for. */
                    <span
                      className="text-xs text-on-surface-variant"
                      data-testid={`package-used-${pkg.id}`}
                    >
                      בשימוש ב־<Ltr>{pkg.used}</Ltr> שורות הזמנה
                    </span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {readOnly ? null : (
        <form
          action={action}
          onReset={keepTypedOnError}
          className="flex flex-wrap items-start gap-2"
        >
          <div className="min-w-40 flex-1">
            <Input name="name" placeholder="שם החבילה — למשל: חבילת 4" data-testid="package-name" />
          </div>
          <label className="text-sm">
            <span className="sr-only">כמות מזכה</span>
            <Input
              name="minQuantity"
              type="number"
              min={2}
              step={1}
              placeholder="כמות"
              className="w-24"
              data-testid="package-quantity"
            />
          </label>
          <label className="text-sm">
            <span className="sr-only">אחוז הנחה</span>
            <Input
              name="discountPercent"
              type="number"
              min={1}
              max={100}
              step="0.01"
              placeholder="% הנחה"
              className="w-28"
              data-testid="package-discount"
            />
          </label>
          <Button type="submit" variant="secondary" disabled={pending} data-testid="package-add">
            <Plus className="size-4" />
            הוספה
          </Button>
          {state.message ? <InlineError>{state.message}</InlineError> : null}
        </form>
      )}
    </section>
  );
}
