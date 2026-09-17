import type { Metadata } from "next";
import { publicationsPhrase } from "@/lib/domain/hebrew-count";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { canReadArea, canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { customerHistoryCounts } from "@/lib/data/customers";
import {
  customerAdvertisements,
  customerOrders,
  customerPublications,
} from "@/lib/data/customer-activity";
import { customerAccount, customerCredit, customerPaymentsPage } from "@/lib/data/payments";
import { paymentsPhrase } from "@/lib/domain/payment";
import { positionLabel } from "@/lib/domain/payment-allocation";
import { openMonthsPhrase } from "@/lib/domain/payment-months";
import { MonthTable } from "@/components/billing/month-table";
import { cn } from "@/lib/utils";
import { deletionBlockedMessage } from "@/lib/domain/customer";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/customer-account";
import { clampPage, parseListParams, type ListParams } from "@/lib/domain/list-view";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { AD_FILE_TYPE_LABELS, formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { DeleteCustomer } from "./delete-customer";
import { getCustomer } from "@/lib/data/customers";
import { AdQuickLook, AdThumb } from "@/components/ads/ad-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { ORDER_TONE, PAYMENT_TONE, PUBLICATION_TONE } from "@/components/status-tone";
import { OrderStatusBadge } from "../../orders/order-badges";
import { formatDate, formatMoney, orderNumber } from "../../orders/format";
import { ConvertToRegular } from "./convert-to-regular";

export const metadata: Metadata = { title: "כרטיס לקוח · Gilion" };

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers");

  const { id } = await params;
  const query = await searchParams;
  const converted = query["converted"];

  /**
   * One set of list parameters per section, namespaced by prefix.
   *
   * Five lists share this page and each has to page, search and resize without
   * disturbing the other four — so `o_page` moves the orders and leaves the
   * publications where they were.
   */
  const listOf = (prefix: string) =>
    parseListParams({
      page: query[`${prefix}_page`],
      size: query[`${prefix}_size`],
      q: query[`${prefix}_q`],
    });

  const ordersParams = listOf("o");
  const pubsParams = listOf("p");
  const adsParams = listOf("a");
  const paymentsParams = listOf("y");
  const monthsParams = listOf("m");

  /**
   * This page's URL with ONE section's parameters stripped.
   *
   * The toolbar writes its own three back on — so a move in the orders list
   * leaves the publications, the files, the payments and the months exactly
   * where they were. Passed as a string because a function cannot cross into a
   * client component as a prop.
   */
  const baseHref = (prefix: string) => {
    const kept = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (!value || key === "converted") continue;
      if (key === `${prefix}_page` || key === `${prefix}_size` || key === `${prefix}_q`) continue;
      kept.set(key, value);
    }
    const qs = kept.toString();
    return qs ? `/customers/${id}?${qs}` : `/customers/${id}`;
  };

  /** Carries the section's live search into the file it downloads. */
  const exportHref = (section: string, params: ListParams) =>
    params.q
      ? `/api/export/customer/${id}/${section}?q=${encodeURIComponent(params.q)}`
      : `/api/export/customer/${id}/${section}`;

  // Scoped lookup: a customer of another business is not found, not forbidden.
  const customer = await getCustomer(ctx.businessId, id);
  if (!customer) notFound();

  const mayEdit = canWriteArea(ctx, "customers");
  // Deletion is admin-only — stricter than editing, and deliberately not tied
  // to the customers permission, which an admin may hand to sales.
  const mayDelete = ctx.role === "admin" || ctx.isSuperAdmin;
  const blockedReason = mayDelete
    ? deletionBlockedMessage(await customerHistoryCounts(ctx.businessId, customer.id))
    : null;
  const maySeeMoney = ctx.role !== "designer"; // FR-8
  const maySeeOrders = canReadArea(ctx, "orders");
  const maySeeAds = canReadArea(ctx, "advertisements");

  const empty = { rows: [], total: 0 };
  const [orders, publications, ads] = await Promise.all([
    maySeeOrders
      ? customerOrders(ctx.businessId, customer.id, ordersParams)
      : Promise.resolve(empty),
    customerPublications(ctx.businessId, customer.id, pubsParams),
    maySeeAds
      ? customerAdvertisements(ctx.businessId, customer.id, adsParams)
      : Promise.resolve(empty),
  ]);

  // FR-8 again: a designer is never handed payment rows, not even to discard
  // in the markup — the filtering is the server's, not the CSS's.
  const [payments, credit] = maySeeMoney
    ? await Promise.all([
        customerPaymentsPage(ctx.businessId, customer.id, paymentsParams),
        // Money received with no order named. The first version of this screen
        // lost it entirely — recorded, listed, counted nowhere.
        customerCredit(ctx.businessId, customer.id),
      ])
    : [{ rows: [], total: 0 }, 0];

  const { account, ...monthly } = maySeeMoney
    ? await customerAccount(ctx.businessId, customer.id)
    : {
        account: {
          billed: 0,
          settled: 0,
          outstanding: 0,
          ranOpen: 0,
          upcomingOpen: 0,
          overpaid: 0,
          notBinding: 0,
        },
        months: [],
        totals: { billed: 0, paid: 0, open: 0 },
      };

  /**
   * The months, searched and paged in memory.
   *
   * They were already read in full to produce the summary above, so a second
   * database round trip would be reading the same rows twice to show fewer.
   */
  const matchedMonths = monthsParams.q
    ? monthly.months.filter((m) => m.label.includes(monthsParams.q))
    : monthly.months;
  const monthPage = clampPage(monthsParams, matchedMonths.length);
  const shownMonths = matchedMonths.slice(
    (monthPage.page - 1) * monthPage.size,
    monthPage.page * monthPage.size,
  );

  // What to actually ask the customer for: the open balance less anything of
  // theirs we are holding. Negative means they are ahead of us.
  const net = account.outstanding - credit;

  return (
    <>
      {converted ? (
        <p
          role="status"
          data-testid="converted-toast"
          className="mb-4 rounded-sm bg-status-success-bg px-4 py-3 text-sm text-status-success-fg"
        >
          הלקוח הפך ללקוח קבוע. כל ההיסטוריה נשמרה.
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 font-serif text-3xl font-semibold" data-testid="customer-name">
            {customer.business_name ?? customer.contact_name}
          </h1>
          <div className="flex items-center gap-3">
            <Badge
              tone={customer.customer_type === "casual" ? "debt" : "neutral"}
              data-testid="customer-type-badge"
            >
              {customer.customer_type === "casual" ? "מזדמן" : "קבוע"}
            </Badge>
            {customer.business_name ? (
              <span className="text-sm text-on-surface-variant">{customer.contact_name}</span>
            ) : null}
          </div>
        </div>

        {mayEdit ? (
          <div className="flex gap-2">
            {customer.customer_type === "casual" ? <ConvertToRegular id={customer.id} /> : null}
            <Button variant="secondary" asChild>
              <Link href={`/customers/${customer.id}/edit`}>
                <Pencil className="size-4" />
                עריכה
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {mayDelete ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <DeleteCustomer
            id={customer.id}
            name={customer.business_name ?? customer.contact_name}
            phone={customer.phone}
            email={customer.email}
            blocked={blockedReason}
          />
        </div>
      ) : null}

      <dl className="mb-8 grid gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-on-surface-variant">טלפון</dt>
          <dd className="mt-1">{customer.phone ? <Ltr>{customer.phone}</Ltr> : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-on-surface-variant">מייל</dt>
          <dd className="mt-1">{customer.email ? <Ltr>{customer.email}</Ltr> : "—"}</dd>
        </div>
        {maySeeMoney ? (
          <div data-testid="customer-debt">
            {/* One line, and deliberately the SAME number the account section
                below headlines. It earns its place by being the glance — who is
                this and do they owe us — beside the phone somebody is about to
                dial; the section under it is the breakdown, and a reader who
                wants only the answer should not have to scroll to it. */}
            <dt className="text-xs text-on-surface-variant">{positionLabel(net)}</dt>
            <dd className="mt-1 font-semibold">
              <Ltr>{formatMoney(Math.abs(net))}</Ltr>
            </dd>
            {credit > 0 ? (
              <p className="mt-1 text-xs text-status-info-fg" data-testid="customer-credit-note">
                כולל <Ltr>{formatMoney(credit)}</Ltr> לזכות הלקוח
              </p>
            ) : null}
          </div>
        ) : null}
      </dl>

      {maySeeMoney && maySeeOrders ? (
        <section className="mb-8" data-testid="customer-account">
          <h2 className="mb-3 font-serif text-xl font-semibold">מצב חשבון</h2>
          {/*
            The five questions, in the order the user asked them (16/09/2026):
            how much was ordered and not paid · how much RAN and was not paid ·
            is the customer in credit · what is owed in total · how much came in.

            The first and the fourth differ only by the credit, and most of the
            time that is zero and they read the same. They are both here on
            purpose: the first is what is on the books and the fourth is what to
            actually ask the customer for, and the caption on the fourth says
            which arithmetic got it there so the match never looks like a bug.
          */}
          <dl className="grid gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 sm:grid-cols-2 lg:grid-cols-5">
            {/* Two BUCKETS, not a total and one of its halves. Each answers
                "how much debt" for its own stage, and the total tile further
                along is the two of them together less any credit. */}
            <div>
              <dt className="text-xs text-on-surface-variant">הוזמנו ולא שולמו</dt>
              <dd className="mt-1 text-2xl font-semibold" data-testid="account-upcoming">
                <Ltr>{formatMoney(account.upcomingOpen)}</Ltr>
              </dd>
              <p className="mt-1 text-xs text-on-surface-variant">טרם יצאו לדפוס</p>
            </div>

            <div>
              <dt className="text-xs text-on-surface-variant">פורסמו ולא שולמו</dt>
              <dd
                className="mt-1 text-2xl font-semibold text-status-debt-fg"
                data-testid="account-ran"
              >
                <Ltr>{formatMoney(account.ranOpen)}</Ltr>
              </dd>
              {/* The distinction the whole derivation rests on, said out loud:
                  an open balance on something not yet printed is money owed and
                  not yet due, and only printing turns it into a debt. */}
              <p className="mt-1 text-xs text-on-surface-variant">כבר יצאו — חוב לכל דבר</p>
            </div>

            <div data-testid="account-credit-tile">
              <dt className="text-xs text-on-surface-variant">יתרת זכות</dt>
              <dd
                className={cn(
                  "mt-1 text-2xl font-semibold",
                  credit > 0 ? "text-status-info-fg" : "text-on-surface-variant",
                )}
                data-testid="account-credit"
              >
                <Ltr>{formatMoney(credit)}</Ltr>
              </dd>
              {/* Asked as a yes/no question, so the caption answers it rather
                  than leaving ₪0.00 to be interpreted. */}
              <p className="mt-1 text-xs text-on-surface-variant">
                {credit > 0 ? "התקבל ולא שויך להזמנה" : "אין יתרה לזכותו"}
              </p>
            </div>

            <div>
              <dt className="text-xs text-on-surface-variant">
                {net < 0 ? "לזכות הלקוח" : "סה״כ חייב"}
              </dt>
              <dd
                className={cn(
                  "mt-1 text-2xl font-semibold",
                  net > 0 ? "text-status-debt-fg" : "text-status-success-fg",
                )}
                data-testid="account-net"
              >
                <Ltr>{formatMoney(Math.abs(net))}</Ltr>
              </dd>
              {/* Says the arithmetic, because this tile is the only one that
                  is not read off a single fact: it is the two buckets together
                  less the credit. */}
              <p className="mt-1 text-xs text-on-surface-variant">
                {credit > 0 ? "שני הסכומים יחד, פחות יתרת הזכות" : "שני הסכומים יחד"}
              </p>
            </div>

            <div>
              <dt className="text-xs text-on-surface-variant">שילם</dt>
              <dd
                className="mt-1 text-2xl font-semibold text-status-success-fg"
                data-testid="account-settled"
              >
                <Ltr>{formatMoney(account.settled)}</Ltr>
              </dd>
              {/* "שילם 1,100" floats without the total it is a part of. Said as
                  a caption rather than a sixth tile, which is not what was
                  asked for. */}
              <p className="mt-1 text-xs text-on-surface-variant">
                מתוך <Ltr data-testid="account-billed">{formatMoney(account.billed)}</Ltr> שהוזמנו
              </p>
            </div>
          </dl>

          <p className="mt-2 text-xs text-on-surface-variant" data-testid="account-source">
            הסכומים מהזמנות מאושרות בלבד. &quot;שילם&quot; הוא סכום רישומי התשלום בפועל, וסטטוס
            התשלום נגזר מהם ואינו נקבע ביד.
            {account.overpaid > 0 ? (
              <>
                {" "}
                <span data-testid="account-overpaid">
                  התקבל מעבר לחיוב: <Ltr>{formatMoney(account.overpaid)}</Ltr>.
                </span>
              </>
            ) : null}
          </p>

          {/* The detail, under the summary. Which months the money above is
              made of — the same table and the same apportioning rule the
              billing window uses, so the two screens cannot quote different
              numbers for the same month. */}
          {monthly.months.length > 0 ? (
            <div className="mt-6" data-testid="customer-month-detail">
              <h3 className="mb-2 text-sm font-semibold">פירוט לפי חודש</h3>
              <p
                className="mb-2 text-xs text-on-surface-variant"
                data-testid="customer-open-months"
              >
                {openMonthsPhrase(monthly.months)}
              </p>
              <ListToolbar
                prefix="m"
                params={monthPage}
                total={matchedMonths.length}
                baseHref={baseHref("m")}
                searchLabel="חודש"
                exportHref={exportHref("months", monthsParams)}
              />
              <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest p-3">
                <MonthTable customerId={customer.id} months={shownMonths} collapseSettled={false} />
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {maySeeMoney ? (
        <section className="mb-8" data-testid="customer-payments-section">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold">תשלומים</h2>
            {canReadArea(ctx, "billing") ? (
              <Link
                href={`/billing?customer=${customer.id}`}
                data-testid="go-to-billing"
                className="text-sm underline underline-offset-2"
              >
                רישום ועריכה במסך הגבייה
              </Link>
            ) : null}
          </div>
          <ListToolbar
            prefix="y"
            params={paymentsParams}
            total={payments.total}
            baseHref={baseHref("y")}
            searchLabel="חשבונית או מספר הזמנה"
            exportHref={exportHref("payments", paymentsParams)}
          />
          {payments.rows.length === 0 ? (
            <EmptyState
              title="עוד לא נרשם תשלום"
              body="רישום תשלום נעשה במסך הגבייה, ומופיע כאן מיד."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
              <table className="w-full text-sm" data-testid="customer-payments">
                <thead className="bg-surface-container">
                  <tr>
                    <th className="p-3 text-start font-semibold">סכום</th>
                    <th className="p-3 text-start font-semibold">תאריך</th>
                    <th className="p-3 text-start font-semibold">חשבונית</th>
                    <th className="p-3 text-start font-semibold">הזמנה</th>
                    <th className="p-3 text-start font-semibold">עודכן</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.rows.map((p) => (
                    <tr
                      key={p.id}
                      data-testid={`customer-payment-${p.id}`}
                      /* A cancelled record is kept and struck through — rule 10
                         says there is no physical delete, and a row that simply
                         vanished would make the balance unexplainable. */
                      className={
                        p.status === "canceled"
                          ? "border-t border-outline-variant text-on-surface-variant line-through opacity-70"
                          : "border-t border-outline-variant"
                      }
                    >
                      <td className="p-3 font-medium">
                        <Ltr>{formatMoney(Number(p.amount))}</Ltr>
                      </td>
                      <td className="p-3">
                        {p.payment_date ? <Ltr>{formatDate(p.payment_date)}</Ltr> : "—"}
                      </td>
                      <td className="p-3">
                        {p.external_invoice_number ? (
                          <Ltr className="font-mono text-xs">{p.external_invoice_number}</Ltr>
                        ) : (
                          <span className="text-xs text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {p.order_id ? (
                          <Link
                            href={`/orders/${p.order_id}`}
                            className="font-mono text-xs underline"
                          >
                            <Ltr>{orderNumber(p.order?.number ?? 0)}</Ltr>
                          </Link>
                        ) : (
                          <span className="text-xs text-on-surface-variant">ליתרת הלקוח</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-on-surface-variant">
                        {p.updated_by.name} · <Ltr>{formatDate(p.updated_at)}</Ltr>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-on-surface-variant" data-testid="customer-payment-count">
            {paymentsPhrase(payments.rows.filter((p) => p.status !== "canceled").length)} מוצגים
            בעמוד הזה.
          </p>
        </section>
      ) : null}

      {maySeeOrders ? (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-xl font-semibold">הזמנות</h2>
          <ListToolbar
            prefix="o"
            params={ordersParams}
            total={orders.total}
            baseHref={baseHref("o")}
            searchLabel="מספר הזמנה או חשבונית"
            exportHref={maySeeMoney ? exportHref("orders", ordersParams) : undefined}
          />
          {orders.rows.length === 0 ? (
            <EmptyState
              title="אין עדיין הזמנות"
              body="כל הזמנה שתיפתח ללקוח הזה תופיע כאן, עם הסכום וסטטוס התשלום שלה."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
              <table className="w-full text-sm" data-testid="customer-orders">
                <thead className="bg-surface-container">
                  <tr>
                    <th className="p-3 text-start font-semibold">הזמנה</th>
                    <th className="p-3 text-start font-semibold">תאריך</th>
                    <th className="p-3 text-start font-semibold">פרסומים</th>
                    <th className="p-3 text-start font-semibold">סטטוס</th>
                    {maySeeMoney ? (
                      <>
                        <th className="p-3 text-start font-semibold">סכום</th>
                        <th className="p-3 text-start font-semibold">תשלום</th>
                        <th className="p-3 text-start font-semibold">חשבונית</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {orders.rows.map((o) => (
                    <tr
                      key={o.id}
                      data-testid={`customer-order-${o.id}`}
                      className="border-t border-outline-variant hover:bg-surface-container-low"
                    >
                      <td className="p-3">
                        <Link href={`/orders/${o.id}`} className="font-mono text-xs underline">
                          <Ltr>{orderNumber(o.number)}</Ltr>
                        </Link>
                      </td>
                      <td className="p-3">
                        <Ltr>{formatDate(o.created_at)}</Ltr>
                      </td>
                      <td className="p-3">{o._count.publications}</td>
                      <td className="p-3">
                        <OrderStatusBadge status={o.status as keyof typeof ORDER_TONE} />
                      </td>
                      {maySeeMoney ? (
                        <>
                          <td className="p-3">
                            <Ltr>{formatMoney(Number(o.total_price))}</Ltr>
                          </td>
                          <td className="p-3">
                            <Badge tone={PAYMENT_TONE[o.payment_status as PaymentStatus]}>
                              {PAYMENT_STATUS_LABELS[o.payment_status as PaymentStatus]}
                            </Badge>
                          </td>
                          <td className="p-3">
                            {o.external_invoice_number ? (
                              <Ltr className="font-mono text-xs">{o.external_invoice_number}</Ltr>
                            ) : (
                              <span className="text-xs text-on-surface-variant">—</span>
                            )}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-3 font-serif text-xl font-semibold">פרסומים</h2>
        <ListToolbar
          prefix="p"
          params={pubsParams}
          total={publications.total}
          baseHref={baseHref("p")}
          searchLabel="עיתון, צורה או מספר הזמנה"
          exportHref={exportHref("publications", pubsParams)}
        />
        {publications.rows.length === 0 ? (
          <EmptyState
            title="אין עדיין פרסומים"
            body="פרסומים נוצרים כשהזמנה מאושרת. טיוטה אינה יוצרת פרסומים."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
            <table className="w-full text-sm" data-testid="customer-publications">
              <thead className="bg-surface-container">
                <tr>
                  <th className="p-3 text-start font-semibold">עיתון</th>
                  <th className="p-3 text-start font-semibold">תאריך</th>
                  <th className="p-3 text-start font-semibold">צורה</th>
                  <th className="p-3 text-start font-semibold">סטטוס</th>
                  <th className="p-3 text-start font-semibold">מודעה</th>
                  {/* A publication exists only because an order was approved.
                      That link was reachable from the orders table and not from
                      here — so "which order is this from" meant reading dates
                      off two tables and guessing. */}
                  <th className="p-3 text-start font-semibold">הזמנה</th>
                  {maySeeMoney ? <th className="p-3 text-start font-semibold">מחיר</th> : null}
                </tr>
              </thead>
              <tbody>
                {publications.rows.map((p) => (
                  <tr key={p.id} className="border-t border-outline-variant">
                    <td className="p-3">{p.newspaper.name}</td>
                    <td className="p-3">
                      <Ltr>{formatDate(p.publication_date)}</Ltr>
                    </td>
                    <td className="p-3">{p.ad_shape.name}</td>
                    <td className="p-3">
                      <Badge tone={PUBLICATION_TONE[p.status as PublicationStatus]}>
                        {PUBLICATION_STATUS_LABELS[p.status as PublicationStatus]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      {p.advertisement_id ? (
                        maySeeAds ? (
                          <Link
                            href={`/advertisements/${p.advertisement_id}`}
                            className="text-xs underline"
                          >
                            יש קובץ
                          </Link>
                        ) : (
                          <span className="text-xs">יש קובץ</span>
                        )
                      ) : (
                        <Badge tone="error">חסר קובץ</Badge>
                      )}
                    </td>
                    <td className="p-3">
                      {maySeeOrders ? (
                        <Link
                          href={`/orders/${p.order_id}`}
                          className="font-mono text-xs underline"
                          data-testid={`publication-order-${p.id}`}
                        >
                          <Ltr>{orderNumber(p.order?.number ?? 0)}</Ltr>
                        </Link>
                      ) : (
                        <Ltr className="font-mono text-xs">{orderNumber(p.order?.number ?? 0)}</Ltr>
                      )}
                    </td>
                    {maySeeMoney ? (
                      <td className="p-3">
                        <Ltr>{formatMoney(Number(p.price))}</Ltr>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {maySeeAds ? (
        <section className="mb-8">
          <h2 className="mb-3 font-serif text-xl font-semibold">קבצים</h2>
          <ListToolbar
            prefix="a"
            params={adsParams}
            total={ads.total}
            baseHref={baseHref("a")}
            searchLabel="שם הקובץ"
            exportHref={exportHref("advertisements", adsParams)}
          />
          {ads.rows.length === 0 ? (
            <EmptyState
              title="אין עדיין קבצים"
              body="קובץ שיועלה ללקוח הזה — מספריית המודעות או ישירות מפרסום — יופיע כאן."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="customer-ads">
              {ads.rows.map((ad) => (
                <li key={ad.id} className="relative">
                  <span className="absolute top-2 end-2 z-10">
                    <AdQuickLook
                      ad={{
                        id: ad.id,
                        name: ad.name,
                        fileType: ad.file_type as AdFileType,
                        fileSize: ad.file_size,
                        previewUrl: ad.preview_url,
                        customerLabel: customer.business_name ?? customer.contact_name,
                        uploadedAt: ad.uploaded_at,
                        publicationCount: ad._count.publications,
                        invalid: ad.validation_status === "failed",
                      }}
                    />
                  </span>
                  <Link
                    href={`/advertisements/${ad.id}`}
                    data-testid={`customer-ad-${ad.id}`}
                    className="flex gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 hover:bg-surface-container-low"
                  >
                    <AdThumb
                      ad={{
                        name: ad.name,
                        fileType: ad.file_type as AdFileType,
                        previewUrl: ad.preview_url,
                      }}
                      className="size-14 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium" title={ad.name}>
                        {ad.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-on-surface-variant">
                        <Ltr>
                          {AD_FILE_TYPE_LABELS[ad.file_type as AdFileType]} ·{" "}
                          {formatBytes(ad.file_size)}
                        </Ltr>
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {ad.validation_status === "failed" ? (
                          <Badge tone="error">דורש טיפול</Badge>
                        ) : ad.status === "archived" ? (
                          <Badge tone="muted">בארכיון</Badge>
                        ) : null}
                        {ad._count.publications > 0 ? (
                          <span className="text-xs text-on-surface-variant">
                            בשימוש ב־{publicationsPhrase(ad._count.publications)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
