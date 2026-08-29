import type { Metadata } from "next";
import Link from "next/link";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listPublications } from "@/lib/data/publications";
import { listNewspapers } from "@/lib/data/newspapers";
import {
  NEEDS_ATTENTION,
  PUBLICATION_STATUSES,
  PUBLICATION_STATUS_LABELS,
  type PublicationStatus,
} from "@/lib/domain/publication-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { PUBLICATION_TONE, TONE_ROW } from "@/components/status-tone";
import { cn } from "@/lib/utils";
import { PublicationStatusBadge, SourceBadge, StatusChip } from "../../orders/order-badges";
import { formatDate, formatMoney, orderNumber } from "../../orders/format";

export const metadata: Metadata = { title: "פרסומים · Gilion" };

export default async function PublicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ newspaper?: string; status?: string; from?: string; to?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "publications");

  const { newspaper = "all", status = "all", from = "", to = "" } = await searchParams;

  // FR-8: a designer places ads but never sees money.
  const maySeeMoney = ctx.role !== "designer";

  /** Clicking a status chip must not silently drop the other filters. */
  const hrefFor = (next: string) => {
    const q = new URLSearchParams();
    if (newspaper !== "all") q.set("newspaper", newspaper);
    if (next !== "all") q.set("status", next);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    const query = q.toString();
    return query ? `/publications?${query}` : "/publications";
  };

  const [rows, papers] = await Promise.all([
    listPublications(ctx.businessId, { newspaperId: newspaper, status, from, to }),
    listNewspapers(ctx.businessId),
  ]);

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">פרסומים</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        כל פרסום מחייב שנוצר מאישור הזמנה. פרסום בלי מודעה או בלי שיבוץ מסומן ברקע אדמדם.
      </p>

      {/* Eight statuses, eight colours — the row is the legend for the table. */}
      <div className="mb-4 flex flex-wrap gap-2" data-testid="status-filters">
        <Link href={hrefFor("all")} aria-current={status === "all" ? "page" : undefined}>
          <span
            className={cn(
              "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors",
              status === "all"
                ? "bg-primary text-on-primary"
                : "bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant hover:bg-surface-container",
            )}
          >
            כל הסטטוסים
          </span>
        </Link>
        {PUBLICATION_STATUSES.map((s) => (
          <Link
            key={s}
            href={hrefFor(s)}
            data-testid={`status-filter-${s}`}
            aria-current={status === s ? "page" : undefined}
          >
            <StatusChip
              tone={PUBLICATION_TONE[s]}
              label={PUBLICATION_STATUS_LABELS[s]}
              active={status === s}
            />
          </Link>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="newspaper">
            עיתון
          </label>
          <select
            id="newspaper"
            name="newspaper"
            defaultValue={newspaper}
            data-testid="filter-newspaper"
            className="h-10 rounded-sm border border-outline-variant bg-surface-container px-3 text-start text-sm"
          >
            <option value="all">כל העיתונים</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* The status filter lives in the chip row above, in colour. It rides
            along here as a hidden field so submitting the other filters keeps it. */}
        <input type="hidden" name="status" value={status} />

        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="from">
            מתאריך
          </label>
          <Input id="from" name="from" type="date" dir="ltr" defaultValue={from} className="w-40" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="to">
            עד תאריך
          </label>
          <Input id="to" name="to" type="date" dir="ltr" defaultValue={to} className="w-40" />
        </div>

        <Button type="submit" variant="secondary" data-testid="apply-filters">
          סינון
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="אין פרסומים להצגה"
          body="פרסומים נוצרים כשהזמנה מאושרת. טיוטה אינה יוצרת פרסומים."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm" data-testid="publications-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">לקוח</th>
                <th className="p-3 text-start font-semibold">עיתון</th>
                <th className="p-3 text-start font-semibold">תאריך</th>
                <th className="p-3 text-start font-semibold">צורה</th>
                {/* Both of these are required by US-001 and were absent from the design. */}
                <th className="p-3 text-start font-semibold" data-testid="col-source">
                  מקור פרסום
                </th>
                <th className="p-3 text-start font-semibold" data-testid="col-status">
                  סטטוס פרסום
                </th>
                <th className="p-3 text-start font-semibold">שיבוץ</th>
                {maySeeMoney ? (
                  <th className="p-3 text-start font-semibold" data-testid="col-price">
                    מחיר
                  </th>
                ) : null}
                <th className="p-3 text-start font-semibold">הזמנה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const attention =
                  NEEDS_ATTENTION.includes(p.status as PublicationStatus) ||
                  p.placement_status === "not_placed";
                return (
                  <tr
                    key={p.id}
                    data-testid={`publication-row-${p.id}`}
                    className={cn(
                      "border-t border-outline-variant",
                      attention
                        ? "bg-status-error-bg/30"
                        : TONE_ROW[PUBLICATION_TONE[p.status as PublicationStatus]] ||
                            "hover:bg-surface-container-low",
                    )}
                  >
                    <td className="p-3">{p.customer.business_name ?? p.customer.contact_name}</td>
                    <td className="p-3">{p.newspaper.name}</td>
                    <td className="p-3">
                      <Ltr>{formatDate(p.publication_date)}</Ltr>
                    </td>
                    <td className="p-3">{p.ad_shape.name}</td>
                    <td className="p-3">
                      <SourceBadge source={p.source} />
                    </td>
                    <td className="p-3">
                      <PublicationStatusBadge status={p.status as PublicationStatus} />
                    </td>
                    <td className="p-3">
                      <Badge tone={p.placement_status === "placed" ? "success" : "neutral"}>
                        {p.placement_status === "placed" ? "שובץ" : "לא שובץ"}
                      </Badge>
                    </td>
                    {maySeeMoney ? (
                      <td className="p-3">
                        <Ltr>{formatMoney(Number(p.price))}</Ltr>
                      </td>
                    ) : null}
                    <td className="p-3">
                      <Link href={`/orders/${p.order_id}`} className="font-mono text-xs underline">
                        <Ltr>{orderNumber(p.order_id)}</Ltr>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
