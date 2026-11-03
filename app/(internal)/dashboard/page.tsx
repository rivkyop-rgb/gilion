import { missedCount } from "@/lib/data/missed-publications";
import { misfitPublications } from "@/lib/data/misfit-publications";
import type { Metadata } from "next";
import { AutoOpenedNotice } from "@/components/issues/auto-opened-notice";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { agrees, counted } from "@/lib/domain/hebrew-count";
import { Plus } from "lucide-react";

import { canReadArea, canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import type { Area } from "@/lib/auth/rbac";
import {
  dashboardCounts,
  weeklySales,
  dashboardWeek,
  paymentStatusByOrder,
  reminderWidget,
} from "@/lib/data/dashboard";
import { listPublicationsPage } from "@/lib/data/publications";
import { listNewspapers } from "@/lib/data/newspapers";
import { customerOptions } from "@/lib/data/customers";
import {
  ensureUpcomingIssues,
  issuePageMap,
  issuesForPublications,
  openIssuesForPlacement,
} from "@/lib/data/issues";
import { billingTotals } from "@/lib/data/payments";
import { refreshReminders } from "@/lib/data/reminders";
import { cardsFor, showsMoney, visibleCards, type DashboardCardKey } from "@/lib/domain/dashboard";
import { internalOrdersNeedApproval } from "@/lib/data/orders";
import { monthRange, isoDay, weekRange } from "@/lib/domain/calendar";
import { daysUntil } from "@/lib/domain/reminders";
import {
  PUBLICATION_STATUSES,
  PUBLICATION_STATUS_LABELS,
  type PublicationStatus,
} from "@/lib/domain/publication-status";
import type { PaymentStatus } from "@/lib/domain/payment-status";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { Button } from "@/components/ui/button";
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import { baseHrefFor, parseListParams } from "@/lib/domain/list-view";
import { Ltr } from "@/components/ui/ltr";
import { cn } from "@/lib/utils";
import { KpiCard } from "./kpi-card";
import { NextIssueCard, OpenBillingCard, SalesCard } from "./hero-cards";
import { DashboardPeriod } from "./period";
import {
  BellRing,
  CalendarDays,
  ClipboardCheck,
  FileWarning,
  LayoutGrid,
  Newspaper,
  Wallet,
} from "lucide-react";
import { DashboardFilters } from "./filters";
import { WeekTable, type WeekRow } from "./week-table";
import { OpenIssuesWidget, RemindersWidget } from "./widgets";

export const metadata: Metadata = { title: "לוח בקרה · Gilion" };

type Search = {
  newspaper?: string;
  customer?: string;
  status?: string;
  from?: string;
  to?: string;
  /** "1" — every date, not only this week (27/09/2026). */
  all?: string;
  page?: string;
  size?: string;
};

/**
 * The operational dashboard (US-001, FR-20).
 *
 * Six numbers, each of which is a link to the list it counted, and one table
 * of the week underneath them. That pairing is the requirement and it is the
 * thing most easily lost: a dashboard whose figures cannot be opened is a
 * report, and this screen exists to be the start of somebody's morning.
 *
 * What a role may see decides what is QUERIED, not what is painted. `cardsFor`
 * returns the cards this viewer gets, `dashboardCounts` is handed exactly that
 * list, and a card nobody may see is a query that never runs — which is what
 * makes FR-8 hold against a reader of the payload and not only against a
 * reader of the screen.
 */
const nextIssueDate = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "numeric",
  month: "numeric",
  timeZone: "UTC",
});

/** Each card borrows the icon of the screen it opens (components/shell/nav-items.ts). */
const KPI_ICON: Record<DashboardCardKey, React.ComponentType<{ className?: string }>> = {
  week: CalendarDays,
  missingAd: FileWarning,
  notPlaced: LayoutGrid,
  debt: Wallet,
  reminders: BellRing,
  openIssues: Newspaper,
  pendingOrders: ClipboardCheck,
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "dashboard");
  // The week's issues open by themselves (12/10/2026) — before they are counted.
  const autoOpened = await ensureUpcomingIssues(ctx.businessId, ctx.userId);
  // Dates that passed without the ad running (03/11/2026) — a decision is owed.
  const missed = canReadArea(ctx, "publications") ? await missedCount(ctx.businessId) : 0;
  // Files that will print shrunk or cropped (03/11/2026).
  const misfit = canReadArea(ctx, "publications")
    ? (await misfitPublications(ctx.businessId)).length
    : 0;

  const week = dashboardWeek();
  const weekFrom = isoDay(week.from);
  const weekTo = isoDay(week.to);
  const month = monthRange(new Date());
  const monthFrom = isoDay(month.from);
  const monthTo = isoDay(month.to);

  const params = await searchParams;
  const filters = {
    newspaper: params.newspaper ?? "all",
    customer: params.customer ?? "all",
    status: params.status ?? "all",
    // The table opens on this week — that is the screen's question. The two
    // date fields stay editable so the other weeks are one change away.
    // `all=1` lifts the dates altogether — "show me everything".
    from: params.all ? "" : (params.from ?? weekFrom),
    to: params.all ? "" : (params.to ?? weekTo),
    all: params.all === "1",
  };
  // The table pages like every other table; the filters above are its own.
  const requested = parseListParams({ page: params.page, size: params.size });
  const listBase = baseHrefFor("/dashboard", { ...params });

  const mayReadArea = (area: Area) => canReadArea(ctx, area);
  const cards = cardsFor(mayReadArea);
  const money = showsMoney(ctx.role);

  const mayReadPublications = mayReadArea("publications");
  const mayReadIssues = mayReadArea("issues");
  const mayReadReminders = mayReadArea("reminders");

  // FR-11: there is no cron in the MVP, so the list is brought up to date when
  // somebody looks at it. Done before the count, or the card reports the state
  // of the last time anybody opened /reminders.
  if (mayReadReminders) await refreshReminders(ctx.businessId);

  const [counts, table, papers, customers, issues, reminders] = await Promise.all([
    dashboardCounts(
      ctx.businessId,
      cards.map((c) => c.key),
      // The period governs the cards as well as the table (27/09/2026).
      {
        ...(filters.from ? { from: new Date(filters.from) } : {}),
        ...(filters.to ? { to: new Date(filters.to) } : {}),
      },
    ),
    mayReadPublications
      ? listPublicationsPage(
          ctx.businessId,
          {
            newspaperId: filters.newspaper,
            customerId: filters.customer,
            status: filters.status,
            from: filters.from,
            to: filters.to,
          },
          requested,
        )
      : Promise.resolve({ rows: [], total: 0, pageSize: 0, list: undefined }),
    mayReadPublications ? listNewspapers(ctx.businessId) : Promise.resolve([]),
    mayReadPublications ? customerOptions(ctx.businessId) : Promise.resolve([]),
    mayReadIssues ? openIssuesForPlacement(ctx.businessId) : Promise.resolve([]),
    mayReadReminders ? reminderWidget(ctx.businessId) : Promise.resolve({ rows: [], total: 0 }),
  ]);

  // The top cards (redesign, 29/09/2026). Eight weeks of sales, this one last;
  // the period's own figure; the money still out; and the next issue's pages.
  const eightWeeks = Array.from({ length: 8 }, (_, i) => {
    const day = new Date(week.from);
    day.setUTCDate(day.getUTCDate() - 7 * (7 - i));
    return weekRange(day);
  });
  const nextIssue = issues[0] ?? null;
  const [salesByWeek, periodSalesRows, billing, nextIssueMap] = await Promise.all([
    money ? weeklySales(ctx.businessId, eightWeeks) : Promise.resolve([]),
    money
      ? weeklySales(ctx.businessId, [
          {
            from: filters.from ? new Date(filters.from) : new Date(0),
            to: filters.to ? new Date(filters.to) : new Date("9999-12-31"),
          },
        ])
      : Promise.resolve([{ total: 0, count: 0 }]),
    money ? billingTotals(ctx.businessId) : Promise.resolve(null),
    nextIssue ? issuePageMap(ctx.businessId, nextIssue.id) : Promise.resolve(null),
  ]);
  const periodSales = periodSalesRows[0] ?? { total: 0, count: 0 };

  // Two lookups the table needs, both one query for the whole page rather than
  // one per row. The payment one is skipped entirely for a designer (FR-8).
  const [issueByDate, payments] = await Promise.all([
    mayReadIssues
      ? issuesForPublications(ctx.businessId, table.rows)
      : Promise.resolve(new Map<string, string>()),
    money
      ? paymentStatusByOrder(
          ctx.businessId,
          table.rows.map((r) => r.order_id),
        )
      : Promise.resolve(new Map<string, string>()),
  ]);

  const rows: WeekRow[] = table.rows.map((p) => ({
    id: p.id,
    customerId: p.customer_id,
    customerName: p.customer.business_name,
    newspaperName: p.newspaper.name,
    date: p.publication_date,
    shapeName: p.ad_shape.name,
    source: p.source as "internal" | "customer_portal",
    status: p.status as PublicationStatus,
    placementStatus: p.placement_status as string,
    hasAdvertisement: p.advertisement_id !== null,
    orderId: p.order_id,
    orderNumber: p.order.number,
    paymentStatus: money ? ((payments.get(p.order_id) ?? null) as PaymentStatus | null) : null,
    issueId: issueByDate.get(`${p.newspaper_id}|${isoDay(p.publication_date)}`) ?? null,
  }));

  const today = new Date();

  /**
   * Whether the table is still showing the week the card counted.
   *
   * The heading said "פרסומים השבוע" whatever the date fields held, so widening
   * the range produced a card reading 0 directly above a table of six rows —
   * two true numbers that look like one contradiction, with nothing on screen
   * to say they are answering different questions.
   */
  const showingThisWeek = filters.from === weekFrom && filters.to === weekTo;

  /** Each card's drill-down carries the very filter — and period — the card counted. */
  const period = [filters.from ? `from=${filters.from}` : "", filters.to ? `to=${filters.to}` : ""]
    .filter(Boolean)
    .join("&");
  const withPeriod = (base: string) =>
    period ? `${base}${base.includes("?") ? "&" : "?"}${period}` : base;
  const isMonth = !filters.all && filters.from === monthFrom && filters.to === monthTo;
  const periodLabel = filters.all
    ? "כל הזמן"
    : showingThisWeek
      ? "השבוע"
      : isMonth
        ? "החודש"
        : `${filters.from || "…"} – ${filters.to || "…"}`;
  const hrefFor: Record<DashboardCardKey, string> = {
    week: withPeriod("/publications"),
    missingAd: withPeriod("/publications?attention=missing_ad"),
    notPlaced: withPeriod("/publications?attention=not_placed"),
    debt: "/billing?status=debt",
    reminders: "/reminders",
    openIssues: "/issues?status=open",
    pendingOrders: "/orders?status=pending_approval",
  };
  const shown = visibleCards(cards, counts, await internalOrdersNeedApproval(ctx.businessId));

  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title font-serif text-headline-lg font-semibold">לוח בקרה</h1>
        {/* The one gold button on the screen: the thing this business does
            most, one click from where every day starts. */}
        {canWriteArea(ctx, "orders") ? (
          <Button asChild variant="gold" size="lg" data-testid="dashboard-new-order">
            <Link href="/orders/new">
              <Plus className="size-5" aria-hidden />
              הזמנה חדשה
            </Link>
          </Button>
        ) : null}
      </div>
      <AutoOpenedNotice opened={autoOpened} />
      {missed > 0 ? (
        <Link
          href="/publications/missed"
          data-testid="dashboard-missed"
          className="mb-3 flex items-center gap-2 rounded-lg border border-status-warning-fg/30 bg-status-warning-bg px-4 py-2 text-sm text-status-warning-fg hover:underline"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {counted(missed, "פרסום אחד", "פרסומים")} {agrees(missed, "עבר", "עברו")} את תאריך העיתון
          ולא {agrees(missed, "פורסם", "פורסמו")} — להעביר לתאריך אחר או לזכות את הלקוח
        </Link>
      ) : null}
      {misfit > 0 ? (
        <Link
          href="/publications/misfit"
          data-testid="dashboard-misfit"
          className="mb-3 flex items-center gap-2 rounded-lg border border-status-warning-fg/30 bg-status-warning-bg px-4 py-2 text-sm text-status-warning-fg hover:underline"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          {counted(misfit, "קובץ אחד לא מתאים", "קבצים לא מתאימים")} לגודל שנמכר — יודפסו מוקטנים
          או חתוכים. לרשימה
        </Link>
      ) : null}
      <p className="mb-3 text-sm text-on-surface-variant" data-testid="dashboard-period-sentence">
        נכנסת כ־{ROLE_LABELS[ctx.role]}. מוצגים נתוני{" "}
        <strong className="text-on-surface">
          {filters.all ? (
            "כל הזמן"
          ) : (
            <>
              {showingThisWeek ? "השבוע " : isMonth ? "החודש " : ""}
              <Ltr>
                {filters.from || "…"} – {filters.to || "…"}
              </Ltr>
            </>
          )}
        </strong>
        . כל מספר למטה נפתח לרשימה שממנה הוא נספר.
      </p>

      <DashboardPeriod
        current={{ from: filters.from, to: filters.to }}
        all={filters.all}
        week={{ from: weekFrom, to: weekTo }}
        month={{ from: monthFrom, to: monthTo }}
        keep={{
          newspaper: filters.newspaper,
          customer: filters.customer,
          status: filters.status,
        }}
      />

      {/* The three cards across the top (redesign, 29/09/2026). Money only for
          a role that may see it (FR-8) — a designer gets the count instead. */}
      <div
        className={cn("mb-6 grid gap-4", money ? "lg:grid-cols-3" : "lg:grid-cols-2")}
        data-testid="dashboard-hero"
      >
        {money ? (
          <SalesCard
            label={
              filters.all
                ? "מכירות · כל הזמן"
                : showingThisWeek
                  ? "מכירות השבוע"
                  : isMonth
                    ? "מכירות החודש"
                    : "מכירות בתקופה"
            }
            total={periodSales.total}
            count={periodSales.count}
            weeks={salesByWeek.map((w) => w.total)}
            href={hrefFor.week}
          />
        ) : null}
        {money && billing ? (
          <OpenBillingCard
            outstanding={billing.outstanding}
            customersInDebt={billing.customersInDebt}
          />
        ) : null}
        {mayReadIssues ? (
          <NextIssueCard
            issue={
              nextIssue
                ? {
                    id: nextIssue.id,
                    newspaperName: nextIssue.newspaperName,
                    date: nextIssueDate.format(nextIssue.date),
                    placedCount: nextIssue.placedCount,
                    plannedCount: nextIssue.plannedCount,
                  }
                : null
            }
            pages={nextIssueMap}
          />
        ) : null}
      </div>

      {/* RTL: the first grid column is the RIGHT one — "what needs me", then
          the widgets — and the table takes the width it needs. */}
      <div className="grid items-start gap-6 xl:grid-cols-[20rem_1fr]">
        <div className="space-y-4 xl:order-first">
          <section
            aria-labelledby="needs-me"
            className="rounded-xl border border-outline-variant bg-surface-container-lowest p-3"
          >
            <h2 id="needs-me" className="px-3 pt-2 pb-1 font-serif text-lg font-bold">
              מה דורש אותי
            </h2>
            <div className="flex flex-col" data-testid="dashboard-kpis">
              {shown.map((card) => (
                <KpiCard
                  key={card.key}
                  label={
                    card.key === "week"
                      ? filters.all
                        ? "כל הפרסומים"
                        : showingThisWeek
                          ? "פרסומים השבוע"
                          : isMonth
                            ? "פרסומים החודש"
                            : "פרסומים בתקופה"
                      : card.label
                  }
                  hint={
                    card.key === "week"
                      ? filters.all
                        ? "מכל התאריכים"
                        : showingThisWeek
                          ? "ראשון עד שבת"
                          : periodLabel
                      : card.hint
                  }
                  value={counts[card.key] ?? 0}
                  tone={card.tone}
                  href={hrefFor[card.key]}
                  testId={`kpi-${card.key}`}
                  icon={KPI_ICON[card.key]}
                />
              ))}
            </div>
          </section>
          {mayReadIssues ? (
            <OpenIssuesWidget issues={issues} mayOpen={canWriteArea(ctx, "issues")} />
          ) : null}
          {mayReadReminders ? (
            <RemindersWidget
              total={reminders.total}
              reminders={reminders.rows.map((r) => ({
                id: r.id,
                customerName: r.customer.business_name,
                customerId: r.customer.id,
                newspaperName: r.publication.newspaper.name,
                date: r.publication.publication_date,
                daysLeft: daysUntil(r.publication.publication_date, today),
              }))}
            />
          ) : null}
        </div>

        {mayReadPublications ? (
          <section
            aria-label="פרסומים בטווח הנבחר"
            data-testid="week-panel"
            className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1"
          >
            {/* Design 01: the heading and the filters are the card's own header,
                on the tinted band, and the table is the card's body. */}
            <div className="border-b border-outline-variant bg-surface-container-low px-5 pt-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-serif text-xl font-semibold" data-testid="week-heading">
                  {filters.all ? (
                    "כל הפרסומים"
                  ) : showingThisWeek ? (
                    "פרסומים השבוע"
                  ) : (
                    <>
                      פרסומים בטווח{" "}
                      <span className="text-base font-normal text-on-surface-variant">
                        <Ltr>
                          {filters.from || "…"} – {filters.to || "…"}
                        </Ltr>
                      </span>
                    </>
                  )}
                </h2>
                <p className="text-xs text-on-surface-variant" data-testid="week-count">
                  {/* The whole count; which of them are on screen is the pager's
                      line under the table. */}
                  <Ltr>{table.total}</Ltr> פרסומים
                </p>
              </div>

              <DashboardFilters
                baseHref="/dashboard"
                values={filters}
                dirty={Object.keys(params).length > 0}
                newspapers={papers.map((p) => ({ id: p.id, name: p.name }))}
                customers={customers.map((c) => ({
                  id: c.id,
                  name: c.business_name,
                }))}
                statuses={PUBLICATION_STATUSES.map((s) => ({
                  value: s,
                  label: PUBLICATION_STATUS_LABELS[s],
                }))}
              />
            </div>

            <div className="px-5 pt-3">
              <ListToolbar
                prefix=""
                params={table.list ?? requested}
                total={table.total}
                baseHref={listBase}
                searchable={false}
              />
            </div>
            <WeekTable rows={rows} showsMoney={money} />
            {table.total > 0 ? (
              <div className="border-t border-outline-variant px-5 pb-3">
                <ListPager
                  prefix=""
                  params={table.list ?? requested}
                  total={table.total}
                  baseHref={listBase}
                />
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </>
  );
}
