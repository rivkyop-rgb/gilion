import type { Metadata } from "next";
import Link from "next/link";

import { canReadArea, canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listPublicationsPage } from "@/lib/data/publications";
import { placeableAds } from "@/lib/data/advertisements";
import type { AdPreviewModel } from "@/components/ads/ad-preview";
import type { AdFileType } from "@/lib/domain/ad-file";
import { listNewspapers } from "@/lib/data/newspapers";
import { customerOptions, getCustomer } from "@/lib/data/customers";
import { shapeOptions } from "@/lib/data/newspapers";
import { counted } from "@/lib/domain/hebrew-count";
import { DetailGrid, ExpandableRow } from "@/components/ui/expandable-row";
import { FilterBuilder } from "@/components/ui/filter-builder";
import { isoDay, weekRange } from "@/lib/domain/calendar";
import { issuesForPublications } from "@/lib/data/issues";
import {
  NEEDS_ATTENTION,
  PUBLICATION_STATUSES,
  PUBLICATION_STATUS_LABELS,
  type PublicationStatus,
} from "@/lib/domain/publication-status";
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  type PaymentStatus,
} from "@/lib/domain/payment-status";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { PAYMENT_TONE, PUBLICATION_TONE, TONE_ROW } from "@/components/status-tone";
import { cn } from "@/lib/utils";
import { CancelPublication } from "../cancel-publication";
import { LinkAdCell } from "../link-ad";
import { PublicationStatusBadge, SourceBadge, StatusChip } from "../../orders/order-badges";
import { formatDate, formatMoney, orderNumber } from "../../orders/format";

export const metadata: Metadata = { title: "פרסומים · Gilion" };

const isPublicationStatus = (v: string): v is PublicationStatus =>
  (PUBLICATION_STATUSES as readonly string[]).includes(v);

/** The dashboard's two drill-downs (FR-20), as they read after "פרסומים". */
const ATTENTION_LABELS: Record<string, string> = {
  missing_ad: "חסרי קובץ",
  not_placed: "שלא שובצו",
};

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
    shape?: string;
    payment?: string;
    source?: string;
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
    shape = "all",
    payment = "all",
    source = "all",
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
    if (shape !== "all") q.set("shape", shape);
    if (payment !== "all") q.set("payment", payment);
    if (source !== "all") q.set("source", source);
    const query = q.toString();
    return query ? `/publications?${query}` : "/publications";
  };
  // A status chip leaves the dashboard's drill-down: "חסרה מודעה" AND "לא
  // שובצו" can only ever be empty. The drill-down has no chip of its own —
  // "חסרי מודעה" beside the status "חסרה מודעה" read as the same status twice;
  // the title and the banner say what is shown.
  const hrefFor = (next: string) => hrefWith({ status: next, attention: "all" });

  // FR-8 again: accounting reads publications but has no access to artwork,
  // so it never receives the ad list and never sees the control.
  const mayLinkAds = canWriteArea(ctx, "advertisements");
  // Cancelling one publication is an ORDERS act — it unwinds part of a
  // commercial agreement — so it follows that permission, not the artwork one.
  const mayCancel = canWriteArea(ctx, "orders");
  const mayOpenIssues = canWriteArea(ctx, "issues");

  const [page, papers, ads, customerRow, shapes, customers] = await Promise.all([
    listPublicationsPage(ctx.businessId, {
      newspaperId: newspaper,
      status,
      from,
      to,
      customerId: customer,
      attention,
      shapeId: shape,
      payment: maySeeMoney ? payment : "all",
      source,
    }),
    listNewspapers(ctx.businessId),
    mayLinkAds ? placeableAds(ctx.businessId) : Promise.resolve([]),
    customer !== "all" ? getCustomer(ctx.businessId, customer) : Promise.resolve(null),
    shapeOptions(ctx.businessId),
    customerOptions(ctx.businessId),
  ]);
  const customerName = customerRow?.business_name ?? null;
  const { rows, total } = page;
  // The arrow, eight fixed columns, and the ones a role may or may not see.
  const columnCount = 9 + (mayLinkAds ? 1 : 0) + (maySeeMoney ? 2 : 0) + (mayCancel ? 1 : 0);

  // One query for the whole table, grouped here: an ad may only be offered to
  // a publication of its own customer (stage 05 rule 5).
  const toPreview = (ad: (typeof ads)[number]): AdPreviewModel => ({
    id: ad.id,
    name: ad.name,
    fileType: ad.file_type as AdFileType,
    fileSize: ad.file_size,
    previewUrl: ad.preview_url,
    fileUrl: ad.file_url,
    customerLabel: ad.customer?.business_name ?? null,
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

  // What the list is narrowed to, in words — for the title and the banner.
  const week = weekRange(new Date());
  const isThisWeek = from === isoDay(week.from) && to === isoDay(week.to);
  const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00Z`));
  const filterParts: string[] = [];
  if (attention === "missing_ad") filterParts.push("שנמכרו ועדיין אין להם קובץ מודעה");
  if (attention === "not_placed") filterParts.push("שיש להם מודעה ועדיין לא שובצו על עמוד");
  if (status !== "all" && isPublicationStatus(status)) {
    filterParts.push(`בסטטוס "${PUBLICATION_STATUS_LABELS[status]}"`);
  }
  if (isThisWeek) filterParts.push("של השבוע הנוכחי");
  else if (from && to) filterParts.push(`בין ${day(from)} ל־${day(to)}`);
  else if (from) filterParts.push(`מ־${day(from)} והלאה`);
  else if (to) filterParts.push(`עד ${day(to)}`);
  const paperName = papers.find((n) => n.id === newspaper)?.name;
  if (paperName) filterParts.push(`בעיתון ${paperName}`);
  if (customerName) filterParts.push(`של ${customerName}`);
  const shapeName = shapes.find((x) => x.value === shape)?.label;
  if (shapeName) filterParts.push(`בגודל ${shapeName}`);
  if (maySeeMoney && payment !== "all" && payment in PAYMENT_STATUS_LABELS) {
    filterParts.push(`בתשלום "${PAYMENT_STATUS_LABELS[payment as PaymentStatus]}"`);
  }
  if (source === "customer_portal") filterParts.push("שהגיעו מפורטל הלקוח");
  if (source === "internal") filterParts.push("שהוזנו במשרד");

  const title =
    (ATTENTION_LABELS[attention]
      ? `פרסומים ${ATTENTION_LABELS[attention]}`
      : status !== "all" && isPublicationStatus(status)
        ? `פרסומים · ${PUBLICATION_STATUS_LABELS[status]}`
        : "פרסומים") + (isThisWeek ? " השבוע" : "");

  return (
    <>
      {/* Every drill-down names what it opened. "פרסומים" over a filtered list
          reads as the whole list — which makes the card that opened it look
          wrong (FR-20). */}
      <h1
        className="mb-1 page-title font-serif text-headline-lg font-semibold"
        data-testid="publications-title"
      >
        {title}
      </h1>
      <p className="mb-4 text-sm text-on-surface-variant">
        כל פרסום מחייב שנוצר מאישור הזמנה. פרסום בלי קובץ או בלי שיבוץ מסומן ברקע אדמדם.
      </p>

      {/* Somebody who arrived from a dashboard card is looking at a SUBSET, and
          a filtered list that does not say what it is filtered by reads as the
          whole list. Every active filter is named, not only the two drill-downs. */}
      {filterParts.length > 0 ? (
        <p
          data-testid="attention-banner"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-status-info-bg px-4 py-3 text-sm text-status-info-fg"
        >
          <span>מוצגים רק פרסומים {filterParts.join(", ")}.</span>
          <Link href="/publications" className="underline" data-testid="clear-filters">
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
        <Link
          href={hrefFor("all")}
          aria-current={status === "all" && attention === "all" ? "page" : undefined}
        >
          <span
            className={cn(
              "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors",
              status === "all" && attention === "all"
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

      <FilterBuilder
        basePath="/publications"
        keep={{ status, attention }}
        values={{
          newspaper: newspaper !== "all" ? newspaper : undefined,
          customer: customer !== "all" ? customer : undefined,
          shape: shape !== "all" ? shape : undefined,
          payment: maySeeMoney && payment !== "all" ? payment : undefined,
          source: source !== "all" ? source : undefined,
          from: from || undefined,
          to: to || undefined,
        }}
        fields={[
          {
            key: "newspaper",
            label: "עיתון",
            kind: "select",
            options: papers.map((n) => ({ value: n.id, label: n.name })),
          },
          {
            key: "customer",
            label: "לקוח",
            kind: "select",
            options: customers.map((c) => ({ value: c.id, label: c.business_name })),
          },
          { key: "shape", label: "גודל", kind: "select", options: shapes },
          ...(maySeeMoney
            ? [
                {
                  key: "payment",
                  label: "תשלום",
                  kind: "select" as const,
                  options: PAYMENT_STATUSES.map((p) => ({
                    value: p,
                    label: PAYMENT_STATUS_LABELS[p],
                  })),
                },
              ]
            : []),
          {
            key: "source",
            label: "מקור",
            kind: "select",
            options: [
              { value: "internal", label: "פנימי" },
              { value: "customer_portal", label: "פורטל לקוח" },
            ],
          },
          { key: "from", label: "מתאריך", kind: "date" },
          { key: "to", label: "עד תאריך", kind: "date" },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="אין פרסומים להצגה"
          body="פרסומים נוצרים כשהזמנה מאושרת. טיוטה אינה יוצרת פרסומים."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <table className="w-full text-sm" data-testid="publications-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="w-8 p-1" aria-label="פרטים" />
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
                {/* US-001 AC-3 names nine facts per publication IN THE LIST,
                    and this one was missing here while the dashboard table
                    carried it — the two screens answer the same question, and
                    this is the one a card drills down INTO. Behind the same
                    gate as the price: a payment status is payment data (FR-8),
                    and a designer's response must not carry it at all. */}
                {maySeeMoney ? (
                  <th className="p-3 text-start font-semibold" data-testid="col-payment">
                    סטטוס תשלום
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
                  <ExpandableRow
                    key={p.id}
                    testId={`publication-row-${p.id}`}
                    colSpan={columnCount}
                    details={
                      <DetailGrid
                        items={[
                          ["סוג עמוד", p.order_item?.page_type.name ?? "—"],
                          [
                            "גודל",
                            <span key="s">
                              {p.ad_shape.name}{" "}
                              <span className="text-on-surface-variant">
                                (<Ltr>{`${p.ad_shape.cols}×${p.ad_shape.rows}`}</Ltr> משבצות)
                              </span>
                            </span>,
                          ],
                          [
                            "כמות בהזמנה",
                            <span key="q">
                              {counted(p.order._count.publications, "פרסום אחד", "פרסומים")} בהזמנה{" "}
                              <Link href={`/orders/${p.order_id}`} className="underline">
                                <Ltr>{orderNumber(p.order.number)}</Ltr>
                              </Link>
                            </span>,
                          ],
                          ...(maySeeMoney
                            ? ([
                                ["מחיר", <Ltr key="m">{formatMoney(Number(p.price))}</Ltr>],
                                [
                                  "תשלום",
                                  <Badge
                                    key="pay"
                                    tone={PAYMENT_TONE[p.payment_status as PaymentStatus]}
                                  >
                                    {PAYMENT_STATUS_LABELS[p.payment_status as PaymentStatus]}
                                  </Badge>,
                                ],
                              ] as Array<[string, React.ReactNode]>)
                            : []),
                          [
                            "קובץ",
                            p.advertisement_id ? (
                              <Link
                                key="ad"
                                href={`/advertisements/${p.advertisement_id}`}
                                className="underline"
                              >
                                {adById.get(p.advertisement_id)?.name ?? "לקובץ"}
                              </Link>
                            ) : (
                              "חסר קובץ"
                            ),
                          ],
                          ["נוצר", <Ltr key="c">{formatDate(p.created_at)}</Ltr>],
                        ]}
                      />
                    }
                    className={cn(
                      "border-t border-outline-variant",
                      attention
                        ? "bg-status-error-bg/30"
                        : TONE_ROW[PUBLICATION_TONE[p.status as PublicationStatus]] ||
                            "hover:bg-surface-container-low",
                    )}
                  >
                    <td className="p-3">
                      <Link href={`/customers/${p.customer_id}`} className="hover:underline">
                        {p.customer.business_name}
                      </Link>
                    </td>
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
                    {maySeeMoney ? (
                      <td className="p-3">
                        <Badge tone={PAYMENT_TONE[p.payment_status as PaymentStatus]}>
                          {PAYMENT_STATUS_LABELS[p.payment_status as PaymentStatus]}
                        </Badge>
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
                            label={p.customer.business_name}
                            date={formatDate(p.publication_date)}
                          />
                        ) : null}
                      </td>
                    ) : null}
                  </ExpandableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
