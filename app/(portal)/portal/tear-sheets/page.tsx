import type { Metadata } from "next";
import { Download } from "lucide-react";

import { getCustomerScope } from "@/lib/auth/portal";
import { portalTearSheets } from "@/lib/data/tear-sheets";
import { tearSheetPath } from "@/lib/tear-sheet-token";
import { formatPortalDate, Ltr } from "@/components/portal/request-parts";

export const metadata: Metadata = { title: "הוכחות פרסום · Gilion" };

/**
 * The customer's own tear sheets (14/10/2026): every ad of theirs that ran,
 * as the page it ran on, ready to open or save. The links are the same signed
 * links the office mails, so what the customer sees here and what they were
 * sent are one thing.
 */
export default async function PortalTearSheetsPage() {
  const scope = await getCustomerScope();
  const sheets = await portalTearSheets(scope.businessId, scope.customerId);

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-8">
      <h1 className="mb-2 page-title font-serif text-headline-lg font-semibold">הוכחות פרסום</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        העמוד שבו פורסמה כל מודעה שלכם, עם מסגרת סביב המודעה. נוסף כאן אוטומטית אחרי שהגיליון
        יוצא לדפוס.
      </p>

      {sheets.length === 0 ? (
        <p className="text-sm text-on-surface-variant" data-testid="portal-tear-sheets-empty">
          עדיין אין מודעות שפורסמו.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="portal-tear-sheets">
          {sheets.map((s) => {
            const url = tearSheetPath(s.publicationId);
            return (
              <li
                key={s.publicationId}
                className="overflow-hidden rounded-lg border border-outline-variant"
              >
                <a href={url} target="_blank" rel="noopener" className="block bg-surface-container">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a signed route */}
                  <img
                    src={url}
                    alt={`${s.newspaperName} ${s.date}`}
                    loading="lazy"
                    className="mx-auto h-56 w-auto"
                  />
                </a>
                <div className="flex items-center justify-between gap-2 p-3 text-sm">
                  <span>
                    <span className="font-medium">{s.newspaperName}</span>
                    <br />
                    <span className="text-on-surface-variant">
                      <Ltr>{formatPortalDate(new Date(s.date))}</Ltr> · {s.shapeName}
                    </span>
                  </span>
                  <a
                    href={`${url}?download=1`}
                    className="inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline"
                  >
                    <Download className="size-4" aria-hidden />
                    הורדה
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
