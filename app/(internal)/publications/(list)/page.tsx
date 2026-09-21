import type { Metadata } from "next";
import Link from "next/link";

import { canReadArea, canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listPublicationsPage } from "@/lib/data/publications";
import { placeableAds } from "@/lib/data/advertisements";
import type { AdPreviewModel } from "@/components/ads/ad-preview";
import type { AdFileType } from "@/lib/domain/ad-file";
import { listNewspapers } from "@/lib/data/newspapers";
import { issuesForPublications } from "@/lib/data/issues";
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
import { CancelPublication } from "../cancel-publication";
import { LinkAdCell } from "../link-ad";
import { PublicationStatusBadge, SourceBadge, StatusChip } from "../../orders/order-badges";
import { formatDate, formatMoney, orderNumber } from "../../orders/format";

export const metadata: Metadata = { title: "פרסומים · Gilion" };

export default async function PublicationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    newspaper?: string;
    status?: string;
    from?: string;
    to?: string;
    customer?: string;
    /** The dashboard's drill-down (FR-20) — see lib/data/publications.ts. */
    attention?: string;
  }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "publications");

  const {
    newspaper = "all",
    status = "all",
    from = "",
    to = "",
    customer = "all",
    attention = "all",
  } = await searchParams;

  // FR-8: a designer places ads but never sees money.
  const maySeeMoney = ctx.role !== "designer";

  /** Clicking a status chip must not silently drop the other filters. */
  const hrefWith = (over: { status?: string; attention?: string }) => {
    const merged = { status, attention, ...over };
    const q = new URLSearchParams();
    if (newspaper !== "all") q.set("newspaper", newspaper);
    if (merged.status !== "all") q.set("status", merged.status);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    if (customer !== "all") q.set("customer", customer);
    if (merged.attention !== "all") q.set("attention", merged.attention);
    const query = q.toString();
    return query ? `/publications?${query}` : "/publications";
  };
  const hrefFor = (next: string) => hrefWith({ status: next });

  // FR-8 again: accounting reads publications but has no access to artwork,
  // so it never receives the ad list and never sees the control.
  const mayLinkAds = canWriteArea(ctx, "advertisements");
  // Cancelling one publication is an ORDERS act — it unwinds part of a
  // commercial agreement — so it follows that permission, not the artwork one.
  const mayCancel = canWriteArea(ctx, "orders");
  const mayOpenIssues = canWriteArea(ctx, "issues");

  const [page, papers, ads] = await Promise.all([
    listPublicationsPage(ctx.businessId, {
      newspaperId: newspaper,
      status,
      from,
      to,
      customerId: customer,
      attention,
    }),
    listNewspapers(ctx.businessId),
    mayLinkAds ? placeableAds(ctx.businessId) : Promise.resolve([]),
  ]);
  const { rows, total } = page;

  // One query for the whole table, grouped here: an ad may only be offered to
  // a publication of its own customer (stage 05 rule 5).
  const toPreview = (ad: (typeof ads)[number]): AdPreviewModel => ({
    id: ad.id,
    name: ad.name,
    fileType: ad.file_type as AdFileType,
    fileSize: ad.file_size,
    previewUrl: ad.preview_url,
    fileUrl: ad.file_url,
    customerLabel: ad.customer?.business_name ?? ad.customer?.contact_name ?? null,
    uploadedBy: ad.uploaded_by.name,
    uploadedAt: ad.uploaded_at,
    publicationCount: ad._count.publications,
  });

  const adsByCustomer = new Map<string, AdPreviewModel[]>();
  for (const ad of ads) {
    if (!ad.customer_id) continue;
    const list = adsByCustomer.get(ad.customer_id) ?? [];
    list.push(toPreview(ad));
    adsByCustomer.set(ad.customer_id, list);
  }
  const adById = new Map(ads.map((a) => [a.id, toPreview(a)]));

  // Each row states ITS OWN newspaper's ceiling, because that is the one the
  // upload will actually be measured against (FR-21).
  const limitByNewspaper = new Map(papers.map((n) => [n.id, n.max_ad_file_size]));

  // Which board each publication belongs to. A publication reaches a board by
  // (newspaper, date) alone, so this is the board's own lookup from the other
  // end — one query for the table, not one per row.
  const issueByDate = canReadArea(ctx, "issues")
    ? await issuesForPublications(ctx.businessId, rows)
    : new Map<string, string>();
  const issueByPublication = new Map(
    rows
      .map((p) => {
        const issueId = issueByDate.get(
          `${p.newspaper_id}|${p.publication_date.toISOString().slice(0, 10)}`,
        );
        return issueId ? ([p.id, issueId] as const) : null;
      })
      .filter((entry): entry is readonly [string, string] => entry !== null),
  );

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">פרסומים</h1>
      <p className="mb-4 text-sm text-on-surface-variant">
        כל פרסום מחייב שנוצר מאישור הזמנה. פרסום בלי מודעה או בלי שיבוץ מסומן ברקע אדמדם.
      </p>

      {/* Somebody who arrived from a KPI card is looking at a SUBSET, and a
          filtered list that does not say what it is filtered by reads as the
          whole list — which makes the card above it look wrong. */}
      {attention !== "all" ? (
        <p
          data-testid="attention-banner"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-status-info-bg px-4 py-3 text-sm text-status-info-fg"
        >
          {attention === "missing_ad"
            ? "מוצגים רק פרסומים שנמכרו ועדיין אין להם קובץ מודעה."
            : "מוצגים רק פרסומים שיש להם מודעה ועדיין לא שובצו על עמוד."}
          <Link href={hrefWith({ attention: "all" })} className="underline">
            הצגת כל הפרסומים
          </Link>
        </p>
      ) : null}

      <p className="mb-4 text-xs text-on-surface-variant" data-testid="publications-count">
        {/* `take` without a count is a silent truncation, and a cut list that
            does not say it was cut reads as a complete answer. */}
        {total > rows.length ? (
          <>
            מוצגים <Ltr>{rows.length}</Ltr> מתוך <Ltr>{total}</Ltr> פרסומים
          </>
        ) : (
          <>
            <Ltr>{total}</Ltr> פרסומים
          </>
        )}
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
            along here as a hidden field so submitting the other filters keeps it.
            So do the two the dashboard sets: submitting the date range must not
            silently widen a list somebody arrived at from a KPI card. */}
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="attention" value={attention} />
        <input type="hidden" name="customer" value={customer} />

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
                {mayLinkAds ? (
                  <th className="p-3 text-start font-semibold" data-testid="col-ad">
                    מודעה
                  </th>
                ) : null}
                {maySeeMoney ? (
                  <th className="p-3 text-start font-semibold" data-testid="col-price">
                    מחיר
                  </th>
                ) : null}
                <th className="p-3 text-start font-semibold">הזמנה</th>
                {mayCancel ? <th className="p-3 text-start font-semibold" /> : null}
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
                      {/* The badge said whether it was placed and stopped there.
                          Somebody reading "לא שובץ" wants to go and place it,
                          and the only route was knowing that an ISSUE is a
                          thing you open first, and finding it in the menu. */}
                      {issueByPublication.get(p.id) ? (
                        <Link
                          href={`/issues/${issueByPublication.get(p.id)}/board`}
                          data-testid={`go-to-board-${p.id}`}
                          className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                        >
                          <Badge tone={p.placement_status === "placed" ? "success" : "neutral"}>
                            {p.placement_status === "placed" ? "שובץ" : "לא שובץ"}
                          </Badge>
                          <span className="text-xs text-on-surface-variant">ללוח</span>
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Badge tone={p.placement_status === "placed" ? "success" : "neutral"}>
                            {p.placement_status === "placed" ? "שובץ" : "לא שובץ"}
                          </Badge>
                          {mayOpenIssues ? (
                            <Link
                              href="/issues/new"
                              data-testid={`open-issue-for-${p.id}`}
                              title="אין עדיין גיליון לתאריך הזה"
                              className="text-xs text-on-surface-variant underline-offset-2 hover:underline"
                            >
                              אין גיליון
                            </Link>
                          ) : null}
                        </span>
                      )}
                    </td>
                    {mayLinkAds ? (
                      <td className="p-3">
                        <LinkAdCell
                          publicationId={p.id}
                          linked={
                            p.advertisement_id ? (adById.get(p.advertisement_id) ?? null) : null
                          }
                          options={adsByCustomer.get(p.customer_id) ?? []}
                          limit={{
                            newspaperName: p.newspaper.name,
                            maxBytes: limitByNewspaper.get(p.newspaper_id) ?? 0,
                          }}
                        />
                      </td>
                    ) : null}
                    {maySeeMoney ? (
                      <td className="p-3">
                        <Ltr>{formatMoney(Number(p.price))}</Ltr>
                      </td>
                    ) : null}
                    <td className="p-3">
                      <Link href={`/orders/${p.order_id}`} className="font-mono text-xs underline">
                        <Ltr>{orderNumber(p.order.number)}</Ltr>
                      </Link>
                    </td>
                    {mayCancel ? (
                      <td className="p-3">
                        {p.status !== "canceled" && p.status !== "published" ? (
                          <CancelPublication
                            publicationId={p.id}
                            label={p.customer.business_name ?? p.customer.contact_name}
                            date={formatDate(p.publication_date)}
                          />
                        ) : null}
                      </td>
                    ) : null}
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
