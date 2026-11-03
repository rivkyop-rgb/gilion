import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { missedPublications } from "@/lib/data/missed-publications";
import { isoDay, jerusalemDay } from "@/lib/domain/calendar";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { counted } from "@/lib/domain/hebrew-count";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { MissedRowActions } from "./missed-row-actions";

export const metadata: Metadata = { title: "פרסומים שלא פורסמו · Gilion" };

const DAY = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });
const MONEY = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });
const orderRef = (n: number) => `ORD-${String(n).padStart(4, "0")}`;

/**
 * Publications whose date passed and that never ran (03/11/2026) — each with
 * the two ways out: another date, or a credit to the customer.
 */
export default async function MissedPublicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ note?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "publications");
  const { note } = await searchParams;
  const rows = await missedPublications(ctx.businessId);
  const mayWrite = canWriteArea(ctx, "orders");
  const today = isoDay(jerusalemDay(new Date()));

  return (
    <div className="max-w-5xl">
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">
        פרסומים שעבר תאריכם ולא פורסמו
      </h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        הזמנות מאושרות שתאריך העיתון שלהן עבר, והמודעה לא נכנסה לגיליון. לכל אחד מהם: להעביר
        לתאריך אחר, או לבטל ולזכות את הלקוח במה ששילם.
      </p>

      {note ? (
        <p
          role="status"
          data-testid="missed-note"
          className="mb-4 flex items-center gap-2 rounded-lg bg-status-success-bg px-4 py-2 text-sm text-status-success-fg"
        >
          <CheckCircle2 className="size-4" aria-hidden />
          {note}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="אין פרסומים שפוספסו" body="כל פרסום שתאריכו עבר — פורסם או טופל." />
      ) : (
        <>
          <p className="mb-2 text-xs text-on-surface-variant" data-testid="missed-count">
            {counted(rows.length, "פרסום אחד דורש החלטה", "פרסומים דורשים החלטה")}
          </p>
          <ul className="space-y-2" data-testid="missed-list">
            {rows.map((p) => {
              const label = `${DAY.format(p.publication_date)} · ${p.newspaper.name} · ${p.customer.business_name}`;
              return (
                <li
                  key={p.id}
                  data-testid={`missed-row-${p.id}`}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-elevation-1"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      <Link href={`/customers/${p.customer.id}`} className="hover:underline">
                        {p.customer.business_name}
                      </Link>
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {p.newspaper.name} · <Ltr>{DAY.format(p.publication_date)}</Ltr> ·{" "}
                      {p.ad_shape.name} · <Ltr>{MONEY.format(Number(p.price))}</Ltr> ·{" "}
                      <Link href={`/orders/${p.order.id}`} className="underline">
                        <Ltr>{orderRef(p.order.number)}</Ltr>
                      </Link>
                    </p>
                    <p className="mt-1 text-xs text-status-warning-fg">
                      {PUBLICATION_STATUS_LABELS[p.status as PublicationStatus]}
                    </p>
                  </div>
                  {mayWrite ? (
                    <MissedRowActions publicationId={p.id} label={label} minDate={today} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
