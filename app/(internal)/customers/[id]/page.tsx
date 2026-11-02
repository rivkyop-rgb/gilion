import type { Metadata } from "next";
import { RecordHistory } from "@/components/record-history";
import { publicationsPhrase } from "@/lib/domain/hebrew-count";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, Pencil, Plus } from "lucide-react";

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
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import { customerActivity } from "@/lib/data/audit";
import { auditActionLabel } from "@/lib/domain/audit-labels";
import { AD_FILE_TYPE_LABELS, formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { DeleteCustomer } from "./delete-customer";
import { getCustomer } from "@/lib/data/customers";
import { EmailLink, PhoneLink } from "@/components/contact-links";
import { ReminderRecipients } from "./reminder-recipients";
import { TearSheetFilterBar, TearSheetPanel } from "./tear-sheet-panel";
import { customerTearSheets, tearSheetFilterOptions } from "@/lib/data/tear-sheets";
import { tearSheetPath } from "@/lib/tear-sheet-token";
import { AdQuickLook, AdThumb } from "@/components/ads/ad-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { ORDER_TONE, PAYMENT_TONE, PUBLICATION_TONE } from "@/components/status-tone";
import { OrderStatusBadge } from "../../orders/order-badges";
import { formatDate, formatMoney, orderNumber } from "../../orders/format";
import { CopyLink } from "@/components/portal/copy-link";
import { businessSlug } from "@/lib/data/portal-link";
import { portalUrl } from "@/lib/portal-origin";

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
  const tearParams = listOf("t");
  const tearFilters = {
    from: query.t_from ?? "",
    to: query.t_to ?? "",
    paper: query.t_paper ?? "",
    shape: query.t_shape ?? "",
    sent: query.t_sent === "sent" || query.t_sent === "unsent" ? query.t_sent : "",
  };

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
      if (!value) continue;
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
  // Backlog 21: the business's portal link, to send this customer.
  const portalLink = await portalUrl(await businessSlug(ctx.businessId));
  const mainContact = customer.contacts[0];
  // Tear sheets — proof of publication (14/10/2026).
  const tearSheets = await customerTearSheets(
    ctx.businessId,
    customer.id,
    {
      from: /^\d{4}-\d{2}-\d{2}$/.test(tearFilters.from) ? tearFilters.from : undefined,
      to: /^\d{4}-\d{2}-\d{2}$/.test(tearFilters.to) ? tearFilters.to : undefined,
      newspaperId: tearFilters.paper || undefined,
      shapeId: tearFilters.shape || undefined,
      sent: (tearFilters.sent || "all") as "all" | "sent" | "unsent",
    },
    tearParams,
  );
  const tearOptions =
    query.tab === "tear-sheets"
      ? await tearSheetFilterOptions(ctx.businessId, customer.id)
      : { newspapers: [], shapes: [] };
  /** This page's URL without the tear-sheet filters (and their paging). */
  const tearFilterBase = (() => {
    const kept = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (!value || /^t_(from|to|paper|shape|sent|page)$/.test(key)) continue;
      kept.set(key, value);
    }
    kept.set("tab", "tear-sheets");
    return `/customers/${id}?${kept.toString()}`;
  })();
  const mayReadAudit = canReadArea(ctx, "audit");
  const activity =
    mayReadAudit && query.tab === "activity"
      ? await customerActivity(ctx.businessId, customer.id)
      : [];

  // The tabs this viewer may open — a role that cannot read a list does not
  // get its tab (FR-8), the same rule the sections always followed.
  const tabs: { key: string; label: string; count?: number }[] = [
    { key: "publications", label: "פרסומים", count: publications.total },
    ...(maySeeOrders ? [{ key: "orders", label: "הזמנות", count: orders.total }] : []),
    ...(maySeeMoney ? [{ key: "payments", label: "תשלומים", count: payments.total }] : []),
    ...(maySeeMoney && maySeeOrders
      ? [{ key: "months", label: "לפי חודש", count: monthly.months.length }]
      : []),
    ...(maySeeAds ? [{ key: "files", label: "קבצים", count: ads.total }] : []),
    { key: "tear-sheets", label: "גזירים", count: tearSheets.total },
    { key: "contacts", label: "אנשי קשר ותזכורות", count: customer.contacts.length },
    // The audit trail of this customer — only for whoever may read /audit,
    // because it carries payment changes (FR-8).
    ...(mayReadAudit ? [{ key: "activity", label: "יומן" }] : []),
  ];
  const tab = tabs.some((t) => t.key === query.tab) ? query.tab! : "publications";
  /** Another tab, with every list's own page and search left where they were. */
  const tabHref = (key: string) => {
    const kept = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v && k !== "tab") kept.set(k, v);
    if (key !== "publications") kept.set("tab", key);
    const qs = kept.toString();
    return qs ? `/customers/${id}?${qs}` : `/customers/${id}`;
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary-container font-serif text-2xl font-bold text-state-active"
          >
            {customer.business_name.trim().charAt(0)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="page-title font-serif text-headline-lg font-semibold"
                data-testid="customer-name"
              >
                {customer.business_name}
              </h1>
              {maySeeMoney && net > 0 ? (
                <Badge tone="debt" data-testid="customer-owes-badge">
                  חייב <Ltr>{formatMoney(net)}</Ltr>
                </Badge>
              ) : null}
            </div>
            {mainContact ? (
              <p className="text-sm text-on-surface-variant" data-testid="customer-main-contact">
                {mainContact.name}
                {mainContact.role ? ` · ${mainContact.role}` : null}
              </p>
            ) : null}
            <div className="mt-1">
              <RecordHistory
                businessId={ctx.businessId}
                targets={[{ type: "Customer", ids: [customer.id] }]}
              />
            </div>
          </div>
        </div>

        {mayEdit || canWriteArea(ctx, "orders") ? (
          <div className="flex flex-wrap gap-2">
            {canWriteArea(ctx, "orders") ? (
              <Button asChild variant="gold">
                <Link href={`/orders/new?customer=${customer.id}`} data-testid="customer-new-order">
                  <Plus className="size-4" />
                  הזמנה חדשה
                </Link>
              </Button>
            ) : null}
            {mayEdit ? (
              <CopyLink url={portalLink} label="העתקת קישור לפורטל" testId="customer-portal-link" />
            ) : null}
            {canWriteArea(ctx, "settings") ? (
              <Button variant="secondary" asChild>
                <Link
                  href={`/customers/${customer.id}/portal-access`}
                  data-testid="portal-access-link"
                >
                  <KeyRound className="size-4" />
                  פורטל: גישה ופעילות
                </Link>
              </Button>
            ) : null}
            {mayEdit ? (
              <Button variant="secondary" asChild>
                <Link href={`/customers/${customer.id}/edit`}>
                  <Pencil className="size-4" />
                  עריכה
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {mayDelete ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <DeleteCustomer
            id={customer.id}
            name={customer.business_name}
            phone={customer.phone}
            email={customer.email}
            blocked={blockedReason}
          />
        </div>
      ) : null}

      <dl className="mb-6 grid gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-on-surface-variant">טלפון העסק</dt>
          <dd className="mt-1">{customer.phone ? <PhoneLink phone={customer.phone} /> : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-on-surface-variant">מייל העסק</dt>
          <dd className="mt-1">{customer.email ? <EmailLink email={customer.email} /> : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-on-surface-variant">ח.פ / ע.מ</dt>
          <dd className="mt-1" data-testid="customer-tax-id">
            {customer.tax_id ? <Ltr>{customer.tax_id}</Ltr> : "—"}
          </dd>
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
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold">מצב חשבון</h2>
            {canReadArea(ctx, "reports") ? (
              <Link
                href={`/reports?customer=${customer.id}`}
                data-testid="customer-report"
                className="text-sm underline underline-offset-2"
              >
                לדוח הלקוח
              </Link>
            ) : null}
          </div>
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
          <dl className="grid gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-6 sm:grid-cols-2 lg:grid-cols-5">
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
        </section>
      ) : null}

      {/* The lists live behind tabs (redesign, 29/09/2026): the card opened as
          one long page of six lists, and the one somebody came for was usually
          the fourth. The tab is in the URL, so it survives a refresh, a link
          can open straight onto it, and "back" returns to the tab before. */}
      <nav
        aria-label="פרטי הלקוח"
        className="mb-5 flex gap-1 overflow-x-auto border-b border-outline-variant"
        data-testid="customer-tabs"
      >
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            scroll={false}
            aria-current={tab === t.key ? "page" : undefined}
            data-testid={`customer-tab-${t.key}`}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-[3px] px-3 py-3 text-sm whitespace-nowrap transition-colors",
              tab === t.key
                ? "border-brand-gold font-semibold text-on-surface"
                : "border-transparent text-on-surface-variant hover:text-on-surface",
            )}
          >
            {t.label}
            {/* `!== undefined`: a tab with nothing in it says 0 — an answer. */}
            {t.count !== undefined ? (
              <span className="text-xs font-normal text-on-surface-variant tabular-nums">
                <Ltr>{t.count}</Ltr>
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {maySeeMoney && tab === "payments" ? (
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
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
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
          <ListPager
            prefix="y"
            params={paymentsParams}
            total={payments.total}
            baseHref={baseHref("y")}
          />
        </section>
      ) : null}

      {maySeeOrders && tab === "orders" ? (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold">הזמנות</h2>
            <Link
              href={`/orders?customer=${customer.id}`}
              data-testid="customer-all-orders"
              className="text-sm underline underline-offset-2"
            >
              לכל ההזמנות של הלקוח
            </Link>
          </div>
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
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
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
          <ListPager
            prefix="o"
            params={ordersParams}
            total={orders.total}
            baseHref={baseHref("o")}
          />
        </section>
      ) : null}

      {tab === "publications" ? (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold">פרסומים</h2>
            <Link
              href={`/publications?customer=${customer.id}`}
              data-testid="customer-all-publications"
              className="text-sm underline underline-offset-2"
            >
              לכל הפרסומים של הלקוח
            </Link>
          </div>
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
            <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
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
                          <Ltr className="font-mono text-xs">
                            {orderNumber(p.order?.number ?? 0)}
                          </Ltr>
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
          <ListPager
            prefix="p"
            params={pubsParams}
            total={publications.total}
            baseHref={baseHref("p")}
          />
        </section>
      ) : null}

      {maySeeAds && tab === "files" ? (
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold">קבצים</h2>
            <Link
              href={`/advertisements?customer=${customer.id}`}
              data-testid="customer-all-ads"
              className="text-sm underline underline-offset-2"
            >
              לכל הקבצים של הלקוח
            </Link>
          </div>
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
                        customerLabel: customer.business_name,
                        uploadedAt: ad.uploaded_at,
                        publicationCount: ad._count.publications,
                        invalid: ad.validation_status === "failed",
                      }}
                    />
                  </span>
                  <Link
                    href={`/advertisements/${ad.id}`}
                    data-testid={`customer-ad-${ad.id}`}
                    className="flex gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3 hover:bg-surface-container-low"
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
          <ListPager prefix="a" params={adsParams} total={ads.total} baseHref={baseHref("a")} />
        </section>
      ) : null}

      {maySeeMoney && maySeeOrders && tab === "months" ? (
        <section className="mb-8" data-testid="customer-months-section">
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
              <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-3">
                <MonthTable customerId={customer.id} months={shownMonths} collapseSettled={false} />
              </div>
              <ListPager
                prefix="m"
                params={monthPage}
                total={matchedMonths.length}
                baseHref={baseHref("m")}
              />
            </div>
          ) : null}
          {monthly.months.length === 0 ? (
            <EmptyState title="אין עדיין חודשים לחשבון" body="חודש נוצר כשהזמנה מאושרת." />
          ) : null}
        </section>
      ) : null}

      {tab === "activity" ? (
        <section className="mb-8" data-testid="customer-activity">
          {activity.length === 0 ? (
            <EmptyState
              title="עוד אין רישומים ביומן"
              body="אישור הזמנה, רישום תשלום, ביטול פרסום ועריכת הלקוח נרשמים כאן."
            />
          ) : (
            <ol className="space-y-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-3">
              {activity.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/audit/${entry.id}`}
                    className="flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-surface-container-low"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2.5 shrink-0 rounded-full",
                        ACTIVITY_TONE[entry.target_type] ?? "bg-outline",
                      )}
                    />
                    <span className="flex flex-col">
                      <span className="text-sm font-medium">
                        {auditActionLabel(entry.action)}
                        <span className="font-normal text-on-surface-variant">
                          {" "}
                          · {ACTIVITY_TARGET[entry.target_type] ?? entry.target_type}
                        </span>
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {entry.user.name} · <Ltr>{ACTIVITY_TIME.format(entry.created_at)}</Ltr>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {tab === "tear-sheets" ? (
        <section data-testid="customer-tear-sheets-section">
          <TearSheetFilterBar
            baseHref={tearFilterBase}
            values={tearFilters}
            newspapers={tearOptions.newspapers}
            shapes={tearOptions.shapes}
          />
          <ListToolbar
            prefix="t"
            params={tearParams}
            total={tearSheets.total}
            baseHref={baseHref("t")}
            searchable={false}
          />
          <TearSheetPanel
            customerId={customer.id}
            wants={customer.wants_tear_sheets}
            editable={mayEdit}
            rows={tearSheets.rows.map((r) => ({
              publicationId: r.publicationId,
              date: formatDate(new Date(r.date)),
              newspaperName: r.newspaperName,
              pageTypeName: r.pageTypeName,
              shapeName: r.shapeName,
              pageNumber: r.pageNumber,
              url: tearSheetPath(r.publicationId),
              deliveries: r.deliveries.map((d) => ({
                batchId: d.batchId,
                sentAt: ACTIVITY_TIME.format(d.sentAt),
                sentBy: d.sentBy,
              })),
            }))}
          />
          {tearSheets.total > 0 ? (
            <ListPager
              prefix="t"
              params={tearParams}
              total={tearSheets.total}
              baseHref={baseHref("t")}
            />
          ) : null}
        </section>
      ) : null}

      {tab === "contacts" ? (
        <div data-testid="customer-contacts-section">
          <ReminderRecipients
            customerId={customer.id}
            editable={mayEdit}
            options={[
              {
                target: "main",
                label: "פרטי העסק",
                phone: customer.phone,
                email: customer.email,
                on: {
                  reminders: customer.reminders_to_main,
                  tear_sheets: customer.tear_sheets_to_main,
                  billing: customer.billing_to_main,
                },
              },
              ...customer.contacts.map((c) => ({
                target: c.id,
                label: c.role ? `${c.name} · ${c.role}` : c.name,
                phone: c.phone,
                email: c.email,
                on: {
                  reminders: c.receives_reminders,
                  tear_sheets: c.receives_tear_sheets,
                  billing: c.receives_billing,
                },
              })),
            ]}
          />

          {customer.contacts.length > 0 || customer.notes ? (
            <div className="mb-8 grid gap-4 lg:grid-cols-2">
              {customer.contacts.length > 0 ? (
                <section
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-6"
                  data-testid="customer-contacts"
                >
                  <h2 className="mb-3 text-sm font-semibold">אנשי קשר</h2>
                  <ul className="space-y-3">
                    {customer.contacts.map((c) => (
                      <li key={c.id} className="text-sm">
                        <span className="font-medium">{c.name}</span>
                        {c.role ? (
                          <span className="text-on-surface-variant"> · {c.role}</span>
                        ) : null}
                        {c.phone || c.email ? (
                          <span className="mt-0.5 flex flex-wrap gap-x-4 text-on-surface-variant">
                            {c.phone ? <PhoneLink phone={c.phone} /> : null}
                            {c.email ? <EmailLink email={c.email} /> : null}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {customer.notes ? (
                <section
                  className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-6"
                  data-testid="customer-notes"
                >
                  <h2 className="mb-3 text-sm font-semibold">הערות</h2>
                  <p className="whitespace-pre-line text-sm">{customer.notes}</p>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/** What each kind of record is called in the יומן. */
const ACTIVITY_TARGET: Record<string, string> = {
  Customer: "הלקוח",
  AdOrder: "הזמנה",
  Publication: "פרסום",
  Payment: "תשלום",
};

/** One colour per kind, so a run of payments reads apart from a run of orders. */
const ACTIVITY_TONE: Record<string, string> = {
  Customer: "bg-outline",
  AdOrder: "bg-primary",
  Publication: "bg-status-warning-fg",
  Payment: "bg-status-success-fg",
};

const ACTIVITY_TIME = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});
