import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { misfitPublications } from "@/lib/data/misfit-publications";
import { businessName, loadSettings } from "@/lib/data/business-settings";
import { textFor } from "@/lib/domain/business-settings";
import {
  fileShapeWords,
  fillTemplate,
  misfitAdvice,
  priceDeltaPhrase,
  sizeCm,
} from "@/lib/domain/customer-messages";
import { reminderRecipients } from "@/lib/domain/reminders";
import { adViewPath } from "@/lib/ad-view-token";
import { requestOrigin } from "@/lib/portal-origin";
import { EmailLink, PhoneLink } from "@/components/contact-links";
import { counted } from "@/lib/domain/hebrew-count";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";

export const metadata: Metadata = { title: "קבצים שלא מתאימים לגודל · Gilion" };

const DAY = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });
const orderRef = (n: number) => `ORD-${String(n).padStart(4, "0")}`;

/** Upcoming files that do not match the space sold (03/11/2026). */
export default async function MisfitPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "publications");
  const [rows, settings, business, origin] = await Promise.all([
    misfitPublications(ctx.businessId),
    loadSettings(ctx.businessId),
    businessName(ctx.businessId),
    requestOrigin(),
  ]);
  const template = textFor("misfit_template", settings.texts);
  // The message to the customer, ready in WhatsApp or mail (03/11/2026): the
  // size bought and the file's, a link to see it in the space, and the two
  // ways out — with the price of the second.
  const messageFor = (r: (typeof rows)[number]) =>
    fillTemplate(template, {
      לקוח: r.customer.business_name,
      עיתון: r.newspaperName,
      תאריך: DAY.format(r.date),
      "גודל שהוזמן": r.shapeName,
      מידות: sizeCm(r.ordered),
      הקובץ: fileShapeWords(r.file),
      "קישור לקובץ": `${origin}${adViewPath(r.id)}`,
      המלצה: misfitAdvice(r.ordered, r.recommended, r.price),
      עסק: business,
      "טלפון העסק": settings.contactPhone ?? "",
    });

  return (
    <div className="max-w-5xl">
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">
        קבצים שלא מתאימים לגודל שנמכר
      </h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        פרסומים קרובים שהקובץ שלהם בפרופורציה אחרת מהשטח — למשל קובץ לאורך על שטח לרוחב. בדפוס הוא
        יצא מוקטן עם שוליים ריקים, או חתוך. כדאי לבקש מהלקוח קובץ בגודל הנכון, או להחליף את הגודל
        בהזמנה.
      </p>
      {rows.length === 0 ? (
        <EmptyState title="כל הקבצים מתאימים" body="אין פרסום קרוב שהקובץ שלו לא מתאים לגודל." />
      ) : (
        <>
          <p className="mb-2 text-xs text-on-surface-variant" data-testid="misfit-count">
            {counted(rows.length, "פרסום אחד", "פרסומים")}
          </p>
          <ul className="space-y-2" data-testid="misfit-list">
            {rows.map((r) => (
              <li
                key={r.id}
                data-testid={`misfit-row-${r.id}`}
                className="flex flex-wrap items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-elevation-1"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-status-warning-fg" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    <Link href={`/customers/${r.customer.id}`} className="hover:underline">
                      {r.customer.business_name}
                    </Link>
                  </p>
                  <p className="text-xs text-on-surface-variant">
                    {r.newspaperName} · <Ltr>{DAY.format(r.date)}</Ltr> · {r.shapeName} ·{" "}
                    <Link href={`/advertisements/${r.ad.id}`} className="underline">
                      {r.ad.name}
                    </Link>
                  </p>
                  <p className="mt-1 text-xs text-status-warning-fg">{r.message}</p>
                  <p className="mt-1 text-xs" data-testid={`misfit-advice-${r.id}`}>
                    הוזמן: {r.shapeName} (<Ltr>{sizeCm(r.ordered)}</Ltr>).{" "}
                    {r.recommended && r.recommended.price !== null ? (
                      <>
                        מתאים לקובץ: <strong>{r.recommended.name}</strong> (
                        <Ltr>{sizeCm(r.recommended)}</Ltr>) —{" "}
                        {priceDeltaPhrase(r.price, r.recommended.price)}.
                      </>
                    ) : (
                      "אין גודל אחר שמתאים לקובץ — צריך קובץ חדש."
                    )}
                  </p>
                  <div
                    className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
                    data-testid={`misfit-send-${r.id}`}
                  >
                    <span className="font-medium">הודעה ללקוח:</span>
                    {reminderRecipients(r.customer).map((to) =>
                      to.phone || to.email ? (
                        <span key={to.label} className="flex flex-wrap items-center gap-2">
                          {!to.isMain ? <span>{to.label}</span> : null}
                          {to.phone ? (
                            <PhoneLink phone={to.phone} message={messageFor(r)} />
                          ) : null}
                          {to.email ? (
                            <EmailLink
                              email={to.email}
                              subject={`המודעה שלך ל${r.newspaperName} — גודל הקובץ`}
                              body={messageFor(r)}
                            />
                          ) : null}
                        </span>
                      ) : (
                        <span key={to.label} className="text-on-surface-variant">
                          אין טלפון או מייל
                        </span>
                      ),
                    )}
                    <a
                      href={adViewPath(r.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      data-testid={`misfit-view-${r.id}`}
                    >
                      מה הלקוח יראה בקישור
                    </a>
                  </div>
                </div>
                <Link
                  href={`/orders/${r.order.id}`}
                  className="shrink-0 rounded-lg border border-outline-variant px-3 py-1.5 text-xs hover:bg-surface-container"
                >
                  להזמנה <Ltr>{orderRef(r.order.number)}</Ltr> — החלפת קובץ
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
