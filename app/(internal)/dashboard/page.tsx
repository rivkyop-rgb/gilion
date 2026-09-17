import type { Metadata } from "next";

import { canReadArea, canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import type { Area } from "@/lib/auth/rbac";
import {
  dashboardCounts,
  dashboardWeek,
  paymentStatusByOrder,
  reminderWidget,
} from "@/lib/data/dashboard";
import { listPublicationsPage } from "@/lib/data/publications";
import { listNewspapers } from "@/lib/data/newspapers";
import { customerOptions } from "@/lib/data/customers";
import { issuesForPublications, openIssuesForPlacement } from "@/lib/data/issues";
import { refreshReminders } from "@/lib/data/reminders";
import { cardsFor, showsMoney, type DashboardCardKey } from "@/lib/domain/dashboard";
import { isoDay } from "@/lib/domain/calendar";
import { daysUntil } from "@/lib/domain/reminders";
import {
  PUBLICATION_STATUSES,
  PUBLICATION_STATUS_LABELS,
  type PublicationStatus,
} from "@/lib/domain/publication-status";
import type { PaymentStatus } from "@/lib/domain/payment-status";
import { ROLE_LABELS } from "@/lib/auth/labels";
import { Ltr } from "@/components/ui/ltr";
import { KpiCard } from "./kpi-card";
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
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "dashboard");

  const week = dashboardWeek();
  const weekFrom = isoDay(week.from);
  const weekTo = isoDay(week.to);

  const params = await searchParams;
  const filters = {
    newspaper: params.newspaper ?? "all",
    customer: params.customer ?? "all",
    status: params.status ?? "all",
    // The table opens on this week — that is the screen's question. The two
    // date fields stay editable so the other weeks are one change away.
    from: params.from ?? weekFrom,
    to: params.to ?? weekTo,
  };

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
    ),
    mayReadPublications
      ? listPublicationsPage(ctx.businessId, {
          newspaperId: filters.newspaper,
          customerId: filters.customer,
          status: filters.status,
          from: filters.from,
          to: filters.to,
        })
      : Promise.resolve({ rows: [], total: 0, pageSize: 0 }),
    mayReadPublications ? listNewspapers(ctx.businessId) : Promise.resolve([]),
    mayReadPublications ? customerOptions(ctx.businessId) : Promise.resolve([]),
    mayReadIssues ? openIssuesForPlacement(ctx.businessId) : Promise.resolve([]),
    mayReadReminders ? reminderWidget(ctx.businessId) : Promise.resolve({ rows: [], total: 0 }),
  ]);

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
    customerName: p.customer.business_name ?? p.customer.contact_name,
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

  /** Each card's drill-down carries the very filter the card counted. */
  const hrefFor: Record<DashboardCardKey, string> = {
    week: `/publications?from=${weekFrom}&to=${weekTo}`,
    missingAd: "/publications?attention=missing_ad",
    notPlaced: `/publications?attention=not_placed&from=${weekFrom}`,
    debt: "/billing?status=debt",
    reminders: "/reminders",
    openIssues: "/issues?status=open",
  };

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">לוח בקרה</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        נכנסת כ־{ROLE_LABELS[ctx.role]}. השבוע הנוכחי הוא{" "}
        <Ltr>
          {weekFrom} – {weekTo}
        </Ltr>{" "}
        (ראשון עד שבת). כל מספר למטה נפתח לרשימה שממנה הוא נספר.
      </p>

      <div
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        data-testid="dashboard-kpis"
      >
        {cards.map((card) => (
          <KpiCard
            key={card.key}
            label={card.label}
            hint={card.hint}
            value={counts[card.key] ?? 0}
            tone={card.tone}
            href={hrefFor[card.key]}
            testId={`kpi-${card.key}`}
          />
        ))}
      </div>

      {/* RTL: the first grid column is the RIGHT one, so the widgets sit beside
          the sidebar and the table takes the width it needs. */}
      <div className="grid items-start gap-6 xl:grid-cols-[20rem_1fr]">
        <div className="space-y-4 xl:order-first">
          {mayReadIssues ? (
            <OpenIssuesWidget issues={issues} mayOpen={canWriteArea(ctx, "issues")} />
          ) : null}
          {mayReadReminders ? (
            <RemindersWidget
              total={reminders.total}
              reminders={reminders.rows.map((r) => ({
                id: r.id,
                customerName: r.customer.business_name ?? r.customer.contact_name,
                newspaperName: r.publication.newspaper.name,
                date: r.publication.publication_date,
                daysLeft: daysUntil(r.publication.publication_date, today),
              }))}
            />
          ) : null}
        </div>

        {mayReadPublications ? (
          <section aria-label="פרסומים בטווח הנבחר" data-testid="week-panel">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-serif text-xl font-semibold" data-testid="week-heading">
                {showingThisWeek ? (
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
                {/* A truncated list that does not say so reads as a full answer. */}
                {table.total > rows.length ? (
                  <>
                    מוצגים <Ltr>{rows.length}</Ltr> מתוך <Ltr>{table.total}</Ltr>
                  </>
                ) : (
                  <>
                    <Ltr>{table.total}</Ltr> פרסומים
                  </>
                )}
              </p>
            </div>

            <DashboardFilters
              baseHref="/dashboard"
              values={filters}
              dirty={Object.keys(params).length > 0}
              newspapers={papers.map((p) => ({ id: p.id, name: p.name }))}
              customers={customers.map((c) => ({
                id: c.id,
                name: c.business_name ?? c.contact_name,
              }))}
              statuses={PUBLICATION_STATUSES.map((s) => ({
                value: s,
                label: PUBLICATION_STATUS_LABELS[s],
              }))}
            />

            <WeekTable rows={rows} showsMoney={money} />
          </section>
        ) : null}
      </div>
    </>
  );
}
