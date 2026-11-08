import { ResetFilters } from "@/components/ui/reset-filters";
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import { clampPage, parseListParams, skipFor, type ListParams } from "@/lib/domain/list-view";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { billingReport, publicationReport } from "@/lib/data/payments";
import { listNewspapers, shapeOptions } from "@/lib/data/newspapers";
import { customerOptions } from "@/lib/data/customers";
import {
  PERIOD_LABELS,
  resolvePeriod,
  shiftPeriod,
  type PeriodKind,
} from "@/lib/domain/payment-report";
import {
  LENS_EXPLANATIONS,
  LENS_LABELS,
  lensCounts,
  type PublicationLens,
} from "@/lib/domain/publication-report";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/payment-status";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { publicationsPhrase } from "@/lib/domain/hebrew-count";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { CustomerScopeBanner } from "@/components/customer-scope";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { PAYMENT_TONE, PUBLICATION_TONE } from "@/components/status-tone";
import { cn } from "@/lib/utils";
import { winbackReport, type WinbackOptions } from "@/lib/data/winback";
import { businessName, loadSettings } from "@/lib/data/business-settings";
import { textFieldByKey, textFor } from "@/lib/domain/business-settings";
import { MessageTemplateEditor } from "@/components/settings/message-template-editor";
import { fillTemplate, WINBACK_FIELDS } from "@/lib/domain/customer-messages";
import { reminderRecipients } from "@/lib/domain/reminders";
import { EmailLink, PhoneLink } from "@/components/contact-links";
import { formatDate, formatMoney, orderNumber } from "../orders/format";
import { StatusChip } from "../orders/order-badges";

export const metadata: Metadata = { title: "דוחות · Gilion" };

const PERIODS: PeriodKind[] = ["week", "month", "custom"];
const LENSES: PublicationLens[] = ["all", "running", "missing_ad", "unplaced", "owing"];

type Params = {
  tab?: string;
  period?: string;
  anchor?: string;
  from?: string;
  to?: string;
  newspaper?: string;
  customer?: string;
  lens?: string;
  page?: string;
  size?: string;
  /** Winback tab: also list customers who already booked again. */
  returned?: string;
  /** Winback tab: only this ad shape. */
  shape?: string;
  /** Winback tab: at least this many publications in the period. */
  min?: string;
};

/**
 * Reports (US-010).
 *
 * Two tabs, because US-010 asks two different questions and the design only
 * drew one of them (docs/design/gaps.md §ה). The first is "who owes what this
 * period", answered per customer; the second is "what is the state of each
 * publication", answered per publication with the four chips that ARE the four
 * acceptance criteria.
 *
 * Every filter lives in the URL. A report someone is looking at is a thing they
 * send to somebody else, and a report held in component state cannot be sent.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "reports");

  const params = await searchParams;
  const tab = params.tab === "publications" || params.tab === "winback" ? params.tab : "payments";
  const period: PeriodKind = PERIODS.includes(params.period as PeriodKind)
    ? (params.period as PeriodKind)
    : "month";
  const anchor = params.anchor ?? "";
  const newspaperId = params.newspaper ?? "all";
  // The customer combobox submits "" for "no filter" (see the control below),
  // so this reads `||` and not `??`: an empty string has to mean "everyone",
  // not "the customer whose id is empty".
  const customerId = params.customer || "all";
  const lens: PublicationLens = LENSES.includes(params.lens as PublicationLens)
    ? (params.lens as PublicationLens)
    : "all";

  const range = resolvePeriod(period, anchor, { from: params.from ?? "", to: params.to ?? "" });
  // Both tables page the same way; only one of them is on screen at a time.
  const list = parseListParams({ page: params.page, size: params.size });

  const hrefFor = (next: Partial<Params>) => {
    const merged: Params = {
      tab,
      period,
      anchor,
      from: params.from ?? "",
      to: params.to ?? "",
      newspaper: newspaperId,
      customer: customerId,
      lens,
      returned: params.returned ?? "",
      shape: params.shape ?? "",
      min: params.min ?? "",
      ...next,
    };
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (!value) continue;
      if (key === "newspaper" && value === "all") continue;
      if (key === "customer" && value === "all") continue;
      if (key === "lens" && value === "all") continue;
      q.set(key, String(value));
    }
    const query = q.toString();
    return query ? `/reports?${query}` : "/reports";
  };

  const [newspapers, customers, shapes] = await Promise.all([
    listNewspapers(ctx.businessId),
    customerOptions(ctx.businessId),
    tab === "winback" ? shapeOptions(ctx.businessId) : Promise.resolve([]),
  ]);
  const shapeId = shapes.some((s) => s.value === params.shape) ? params.shape! : "";
  const minCount = Math.max(0, Math.min(99, Math.trunc(Number(params.min) || 0)));
  const scoped = customers.find((c) => c.id === customerId) ?? null;

  const filters = { from: range.from, to: range.to, newspaperId, customerId };

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">
        {scoped ? `דוחות · ${scoped.business_name}` : "דוחות"}
      </h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        התקופה נקבעת לפי <strong>תאריך הפרסום</strong>, ולא לפי מתי ההזמנה נפתחה — הזמנה שנמכרה במרץ
        לארבעה שבועות באפריל מופיעה בדוח של אפריל.
      </p>

      {scoped ? (
        <CustomerScopeBanner
          customerId={scoped.id}
          name={scoped.business_name}
          what="השורות"
          clearHref={hrefFor({ customer: "all" })}
        />
      ) : null}

      <div className="mb-5 flex gap-2 border-b border-outline-variant" data-testid="report-tabs">
        <TabLink
          href={hrefFor({ tab: "payments" })}
          active={tab === "payments"}
          testId="tab-payments"
        >
          דוח תשלומים
        </TabLink>
        <TabLink
          href={hrefFor({ tab: "publications" })}
          active={tab === "publications"}
          testId="tab-publications"
        >
          דוח ברמת פרסום
        </TabLink>
        <TabLink href={hrefFor({ tab: "winback" })} active={tab === "winback"} testId="tab-winback">
          לקוחות לחידוש
        </TabLink>
      </div>

      {/* --- period ------------------------------------------------------- */}
      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="period-filters">
        {PERIODS.map((p) => (
          <Link key={p} href={hrefFor({ period: p })} data-testid={`period-${p}`}>
            <span
              className={cn(
                "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors",
                period === p
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant hover:bg-surface-container",
              )}
            >
              {PERIOD_LABELS[p]}
            </span>
          </Link>
        ))}

        {period === "custom" ? null : (
          <span className="ms-2 inline-flex items-center gap-1">
            {/* RTL: ChevronRight points backwards on screen — earlier period. */}
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={hrefFor({ anchor: shiftPeriod(period, anchor || range.from, -1) })}
                data-testid="period-prev"
                aria-label="תקופה קודמת"
              >
                <ChevronRight className="size-4" />
              </Link>
            </Button>
            <span
              className="rounded-sm bg-surface-container px-3 py-1 text-sm"
              data-testid="period-range"
            >
              <Ltr>
                {range.from} — {range.to}
              </Ltr>
            </span>
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={hrefFor({ anchor: shiftPeriod(period, anchor || range.from, 1) })}
                data-testid="period-next"
                aria-label="תקופה הבאה"
              >
                <ChevronLeft className="size-4" />
              </Link>
            </Button>
          </span>
        )}
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value={tab} />
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="lens" value={lens} />
        {period === "custom" ? null : <input type="hidden" name="anchor" value={anchor} />}

        {period === "custom" ? (
          <>
            <div>
              <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="from">
                מתאריך
              </label>
              <Input
                id="from"
                name="from"
                type="date"
                dir="ltr"
                defaultValue={range.from}
                className="w-40"
                data-testid="report-from"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="to">
                עד תאריך
              </label>
              <Input
                id="to"
                name="to"
                type="date"
                dir="ltr"
                defaultValue={range.to}
                className="w-40"
                data-testid="report-to"
              />
            </div>
          </>
        ) : null}

        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="newspaper">
            עיתון
          </label>
          <select
            id="newspaper"
            name="newspaper"
            defaultValue={newspaperId}
            data-testid="report-newspaper"
            className="h-10 rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
          >
            {/* US-010 AC-1 asks for both, and "all" is the default question. */}
            <option value="all">כל העיתונים</option>
            {newspapers.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        {/*
          Type-to-filter, the same control the order builder uses — a plain
          <select> is already unusable at a few hundred customers, and this
          screen is where somebody looks up ONE advertiser by name. The hidden
          input it carries submits the id while the visible field holds the
          name, which is why it drops straight into this form.
        */}
        <div className="w-64">
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="customer">
            לקוח
          </label>
          <Combobox
            id="customer"
            name="customer"
            testId="report-customer"
            options={customers.map((c) => ({
              value: c.id,
              label: c.business_name,
            }))}
            // "" and not "all": an empty combobox IS "no filter", and giving
            // that state a sentinel value would need a fake option to select.
            defaultValue={customerId === "all" ? "" : customerId}
            placeholder="כל הלקוחות"
            emptyText="אין לקוח בשם הזה"
          />
        </div>

        {tab === "winback" ? (
          <>
            <div>
              <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="shape">
                גודל
              </label>
              <select
                id="shape"
                name="shape"
                defaultValue={shapeId}
                data-testid="winback-shape"
                className="h-10 rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
              >
                <option value="">כל הגדלים</option>
                {shapes.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="min">
                פרסמו לפחות
              </label>
              <select
                id="min"
                name="min"
                defaultValue={minCount > 1 ? String(minCount) : ""}
                data-testid="winback-min"
                className="h-10 rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
              >
                <option value="">פעם אחת</option>
                {[2, 3, 4, 6, 8, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} פעמים
                  </option>
                ))}
              </select>
            </div>
            {includeReturnedHidden(params.returned)}
          </>
        ) : null}

        <Button type="submit" variant="secondary" data-testid="report-apply">
          הצגה
        </Button>
        <ResetFilters
          href={`/reports?tab=${tab}`}
          active={
            newspaperId !== "all" ||
            customerId !== "all" ||
            Boolean(params.from || params.to || params.shape || params.min)
          }
        />
      </form>

      {tab === "payments" ? (
        <PaymentsTab
          businessId={ctx.businessId}
          filters={filters}
          list={list}
          listBase={hrefFor({})}
        />
      ) : tab === "winback" ? (
        <WinbackTab
          businessId={ctx.businessId}
          filters={filters}
          includeReturned={params.returned === "1"}
          mayEditTemplate={
            (ctx.role === "admin" || ctx.isSuperAdmin) && canWriteArea(ctx, "settings")
          }
          options={{ shapeId: shapeId || undefined, minCount: minCount || undefined }}
          hrefFor={hrefFor}
          list={list}
          listBase={hrefFor({})}
        />
      ) : (
        <PublicationsTab
          businessId={ctx.businessId}
          filters={filters}
          lens={lens}
          hrefFor={hrefFor}
          list={list}
          listBase={hrefFor({})}
        />
      )}
    </>
  );
}

function TabLink({
  href,
  active,
  testId,
  children,
}: {
  href: string;
  active: boolean;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-on-surface"
          : "border-transparent text-on-surface-variant hover:text-on-surface",
      )}
    >
      {children}
    </Link>
  );
}

type Filters = { from: string; to: string; newspaperId: string; customerId: string };

/** The four numbers PRD §7 says a bookkeeper opens this report to see. */
async function PaymentsTab({
  businessId,
  filters,
  list: requested,
  listBase,
}: {
  businessId: string;
  filters: Filters;
  list: ListParams;
  listBase: string;
}) {
  const { rows: all, totals } = await billingReport(businessId, filters);
  // The totals above the table are of everyone; the table is paged.
  const list = clampPage(requested, all.length);
  const rows = all.slice(skipFor(list), skipFor(list) + list.size);

  if (rows.length === 0) {
    return (
      <EmptyState
        title="אין פרסומים בתקופה הזאת"
        body="אפשר להרחיב את הטווח, או לבחור עיתון אחר. הדוח נבנה מתאריכי הפרסום."
      />
    );
  }

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="report-totals">
        <Total label="סה״כ לחיוב" value={totals.billed} testId="report-total-billed" />
        <Total
          label="שולם"
          value={totals.paid}
          testId="report-total-paid"
          tone="text-status-success-fg"
        />
        <Total
          label="יתרה"
          value={totals.outstanding}
          testId="report-total-outstanding"
          tone="text-status-debt-fg"
        />
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4">
          <p className="text-xs text-on-surface-variant">פרסומים בתקופה</p>
          <p className="mt-1 font-serif text-3xl font-semibold" data-testid="report-total-count">
            <Ltr>{totals.publicationCount}</Ltr>
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">
            {totals.customersInDebt} לקוחות עם יתרה
          </p>
        </div>
      </div>

      <ListToolbar
        prefix=""
        params={list}
        total={all.length}
        baseHref={listBase}
        searchable={false}
        exportHref={listBase.replace(/^\/reports/, "/api/export/report")}
      />
      <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
        <table className="w-full text-sm" data-testid="payments-report-table">
          <thead className="bg-surface-container">
            <tr>
              <th className="p-3 text-start font-semibold">לקוח</th>
              <th className="p-3 text-start font-semibold">פרסומים</th>
              <th className="p-3 text-start font-semibold">סכום לתשלום</th>
              <th className="p-3 text-start font-semibold">ששולם</th>
              <th className="p-3 text-start font-semibold">יתרה</th>
              <th className="p-3 text-start font-semibold">מספר חשבונית</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.customerId}
                data-testid={`report-row-${row.customerId}`}
                className={cn(
                  "border-t border-outline-variant",
                  row.outstanding > 0 ? "bg-status-error-bg/20" : "hover:bg-surface-container-low",
                )}
              >
                <td className="p-3 font-medium">
                  <Link
                    href={`/customers/${row.customerId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {row.customerLabel}
                  </Link>
                </td>
                <td className="p-3">
                  <Ltr>{row.publicationCount}</Ltr>
                </td>
                <td className="p-3">
                  <Ltr>{formatMoney(row.billed)}</Ltr>
                </td>
                <td className="p-3 text-status-success-fg">
                  <Ltr>{formatMoney(row.paid)}</Ltr>
                </td>
                <td className="p-3 font-semibold">
                  <Ltr>{formatMoney(row.outstanding)}</Ltr>
                </td>
                <td className="p-3">
                  {row.invoiceNumbers.length > 0 ? (
                    <Ltr className="font-mono text-xs">{row.invoiceNumbers.join(", ")}</Ltr>
                  ) : (
                    <span className="text-xs text-on-surface-variant">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ListPager prefix="" params={list} total={all.length} baseHref={listBase} />

      {/*
        A payment is recorded against an ORDER, and an order can run across
        several periods. Saying how the number was reached is what keeps a
        weekly figure from reading as a mistake against the monthly one.
      */}
      <p className="mt-2 text-xs text-on-surface-variant" data-testid="report-apportion-note">
        תשלום שנרשם על הזמנה מתחלק בין התקופות לפי חלקן בהזמנה — הזמנה של ארבעה פרסומים ששולמה
        במלואה מוצגת כרבע בכל שבוע.
      </p>
    </>
  );
}

/**
 * The publication-level report (US-010 AC-2, AC-3).
 *
 * The chips carry live counts, which is the reason the lens filters in memory
 * rather than in the `where`: a chip that cannot say how many rows it holds is
 * a chip somebody has to click to find out, four times.
 */
async function PublicationsTab({
  businessId,
  filters,
  lens,
  hrefFor,
  list: requested,
  listBase,
}: {
  businessId: string;
  filters: Filters;
  lens: PublicationLens;
  hrefFor: (next: Partial<Params>) => string;
  list: ListParams;
  listBase: string;
}) {
  const { rows: matching, all } = await publicationReport(businessId, { ...filters, lens });
  const list = clampPage(requested, matching.length);
  const rows = matching.slice(skipFor(list), skipFor(list) + list.size);
  const counts = lensCounts(all);

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2" data-testid="lens-filters">
        {LENSES.map((l) => (
          <Link key={l} href={hrefFor({ lens: l })} data-testid={`lens-${l}`}>
            <StatusChip
              tone={
                l === "owing"
                  ? "debt"
                  : l === "missing_ad"
                    ? "error"
                    : l === "unplaced"
                      ? "warning"
                      : l === "running"
                        ? "success"
                        : "neutral"
              }
              label={LENS_LABELS[l]}
              count={counts[l]}
              active={lens === l}
            />
          </Link>
        ))}
      </div>

      <p className="mb-4 text-xs text-on-surface-variant" data-testid="lens-explanation">
        {LENS_EXPLANATIONS[lens]}
      </p>

      <ListToolbar
        prefix=""
        params={list}
        total={matching.length}
        baseHref={listBase}
        searchable={false}
        exportHref={listBase.replace(/^\/reports/, "/api/export/report")}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="אין פרסומים שעונים לסינון"
          body="אפשר לבחור צ׳יפ אחר או להרחיב את התקופה."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <table className="w-full text-sm" data-testid="publications-report-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">לקוח</th>
                <th className="p-3 text-start font-semibold">עיתון</th>
                <th className="p-3 text-start font-semibold">תאריך</th>
                <th className="p-3 text-start font-semibold">צורה</th>
                <th className="p-3 text-start font-semibold">סטטוס פרסום</th>
                <th className="p-3 text-start font-semibold">שיבוץ</th>
                <th className="p-3 text-start font-semibold">תשלום</th>
                <th className="p-3 text-start font-semibold">הזמנה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-testid={`report-publication-${row.id}`}
                  className="border-t border-outline-variant hover:bg-surface-container-low"
                >
                  <td className="p-3">
                    <Link
                      href={`/customers/${row.customerId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.customerLabel}
                    </Link>
                  </td>
                  <td className="p-3">{row.newspaper}</td>
                  <td className="p-3">
                    <Ltr>{formatDate(row.date)}</Ltr>
                  </td>
                  <td className="p-3">{row.shape}</td>
                  <td className="p-3">
                    <Badge tone={PUBLICATION_TONE[row.status as PublicationStatus]}>
                      {PUBLICATION_STATUS_LABELS[row.status as PublicationStatus]}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge tone={row.placementStatus === "placed" ? "success" : "neutral"}>
                      {row.placementStatus === "placed" ? "שובץ" : "לא שובץ"}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge tone={PAYMENT_TONE[row.paymentStatus as PaymentStatus]}>
                      {PAYMENT_STATUS_LABELS[row.paymentStatus as PaymentStatus]}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Link href={`/orders/${row.orderId}`} className="font-mono text-xs underline">
                      <Ltr>{orderNumber(row.orderNumber)}</Ltr>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matching.length > 0 ? (
        <ListPager prefix="" params={list} total={matching.length} baseHref={listBase} />
      ) : null}
      <p className="mt-2 text-xs text-on-surface-variant" data-testid="lens-count">
        {publicationsPhrase(matching.length)} בתצוגה.
      </p>
    </>
  );
}

function Total({
  label,
  value,
  testId,
  tone,
}: {
  label: string;
  value: number;
  testId: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className={cn("mt-1 font-serif text-3xl font-semibold", tone)} data-testid={testId}>
        <Ltr>{formatMoney(value)}</Ltr>
      </p>
    </div>
  );
}

/**
 * Who advertised in the period, one row per customer, with a message ready to
 * ask them again (03/11/2026). Pick last year's dates and the list is "who to
 * call this season".
 */
async function WinbackTab({
  businessId,
  filters,
  includeReturned,
  options,
  mayEditTemplate,
  hrefFor,
  list: requested,
  listBase,
}: {
  businessId: string;
  filters: Filters;
  includeReturned: boolean;
  options: WinbackOptions;
  mayEditTemplate: boolean;
  hrefFor: (next: Partial<Params>) => string;
  list: ListParams;
  listBase: string;
}) {
  const [all, settings, business] = await Promise.all([
    winbackReport(businessId, filters, options),
    loadSettings(businessId),
    businessName(businessId),
  ]);
  const matching = includeReturned ? all : all.filter((r) => !r.returned);
  const hidden = all.length - matching.length;
  const list = clampPage(requested, matching.length);
  const rows = matching.slice(skipFor(list), skipFor(list) + list.size);
  const template = textFor("winback_template", settings.texts);

  return (
    <>
      <p className="mb-3 text-xs text-on-surface-variant" data-testid="winback-explanation">
        כל לקוח שפרסם בתקופה שנבחרה — שורה אחת ללקוח, עם הודעה מוכנה בוואטסאפ או במייל לשאול אם ירצה
        לפרסם שוב. כדי למצוא את מי שפרסם בשנה שעברה: &quot;טווח&quot; ותאריכים של אז.{" "}
        {hidden > 0 && !includeReturned ? (
          <>
            {hidden === 1 ? "לקוח אחד" : `${hidden} לקוחות`} שכבר הזמינו שוב אחרי התקופה לא מוצגים —{" "}
            <Link href={hrefFor({ returned: "1", page: "" })} className="underline">
              להציג גם אותם
            </Link>
            .
          </>
        ) : includeReturned ? (
          <Link href={hrefFor({ returned: "", page: "" })} className="underline">
            להסתיר את מי שכבר הזמין שוב
          </Link>
        ) : null}
      </p>

      <MessageTemplateEditor
        templateKey="winback_template"
        title="נוסח ההודעה ללקוחות"
        hint="לחיצה לעריכה. הנוסח שנשמר ישמש מעכשיו לכל ההודעות"
        fields={WINBACK_FIELDS}
        folded
        current={template}
        fallback={textFieldByKey("winback_template")?.default ?? ""}
        maxLength={textFieldByKey("winback_template")?.maxLength ?? 1000}
        mayEdit={mayEditTemplate}
        sample={
          rows[0]
            ? {
                לקוח: rows[0].customerName,
                עיתון: rows[0].newspapers[0] ?? "",
                "תאריך אחרון": formatDate(rows[0].lastDate),
                גודל: rows[0].lastShape,
                עסק: business,
                "טלפון העסק": settings.contactPhone ?? "",
              }
            : null
        }
      />

      <ListToolbar
        prefix=""
        params={list}
        total={matching.length}
        baseHref={listBase}
        searchable={false}
        exportHref={listBase.replace(/^\/reports/, "/api/export/report")}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="אין לקוחות שפרסמו בתקופה הזו"
          body="אפשר להרחיב את התקופה או לבחור עיתון אחר."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <table className="w-full text-sm" data-testid="winback-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">לקוח</th>
                <th className="p-3 text-start font-semibold">פרסום אחרון בתקופה</th>
                <th className="p-3 text-start font-semibold">כמה פרסומים</th>
                <th className="p-3 text-start font-semibold">עיתון</th>
                <th className="p-3 text-start font-semibold">הודעה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.customerId}
                  data-testid={`winback-row-${row.customerId}`}
                  className="border-t border-outline-variant align-top hover:bg-surface-container-low"
                >
                  <td className="p-3">
                    <Link
                      href={`/customers/${row.customerId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.customerName}
                    </Link>
                    {row.returned ? (
                      <Badge tone="success" className="ms-2">
                        כבר הזמין שוב
                      </Badge>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <Ltr>{formatDate(row.lastDate)}</Ltr>
                    <span className="block text-xs text-on-surface-variant">{row.lastShape}</span>
                  </td>
                  <td className="p-3">
                    <Ltr>{row.count}</Ltr>
                  </td>
                  <td className="p-3">{row.newspapers.join(", ")}</td>
                  <td className="p-3">
                    <ul
                      className="space-y-1 text-xs"
                      data-testid={`winback-send-${row.customerId}`}
                    >
                      {reminderRecipients(row).map((to) => {
                        const message = fillTemplate(template, {
                          לקוח: row.customerName,
                          עיתון: row.newspapers[0] ?? "",
                          "תאריך אחרון": formatDate(row.lastDate),
                          גודל: row.lastShape,
                          עסק: business,
                          "טלפון העסק": settings.contactPhone ?? "",
                        });
                        return (
                          <li key={to.label} className="flex flex-wrap items-center gap-2">
                            {!to.isMain ? <span>{to.label}</span> : null}
                            {to.phone ? <PhoneLink phone={to.phone} message={message} /> : null}
                            {to.email ? (
                              <EmailLink
                                email={to.email}
                                subject={`פרסום ב${row.newspapers[0] ?? "עיתון"}`}
                                body={message}
                              />
                            ) : null}
                            {!to.phone && !to.email ? (
                              <span className="text-on-surface-variant">אין טלפון או מייל</span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matching.length > 0 ? (
        <ListPager prefix="" params={list} total={matching.length} baseHref={listBase} />
      ) : null}
    </>
  );
}

/** The "show who already came back" choice survives applying the other filters. */
function includeReturnedHidden(returned: string | undefined) {
  return returned === "1" ? <input type="hidden" name="returned" value="1" /> : null;
}
