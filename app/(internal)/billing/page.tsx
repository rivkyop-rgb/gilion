import { ResetFilters } from "@/components/ui/reset-filters";
import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitForm } from "@/components/ui/auto-submit-form";
import { Wallet } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { billingCustomers, billingRowFacts, billingTotals, debtAging } from "@/lib/data/payments";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS } from "@/lib/domain/payment-status";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { PAYMENT_TONE, TONE_ROW } from "@/components/status-tone";
import { AgingBoxes } from "./aging-boxes";
import { cn } from "@/lib/utils";
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import {
  baseHrefFor,
  clampPage,
  DEFAULT_PAGE_SIZE,
  parseListParams,
  skipFor,
} from "@/lib/domain/list-view";
import { formatDate, formatMoney, orderNumber } from "../orders/format";
import { StatusChip } from "../orders/order-badges";
import { CustomerJump } from "./customer-jump";
import { redirect } from "next/navigation";
import { listCustomerOptions } from "@/lib/data/customers";

export const metadata: Metadata = { title: "גבייה · Gilion" };

/**
 * Billing (US-010, FR-7).
 *
 * One row per customer with money on the books, and the row opens in place
 * into everything needed to act: the orders, the payment records, the form,
 * and who last changed what. It opens through the URL rather than local state
 * so that a reload — and a Playwright run — lands on the same open row.
 *
 * `designer` never reaches this screen and `sales` does not either (FR-8). The
 * guard is the server's, not the sidebar's.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    customer?: string;
    page?: string;
    size?: string;
  }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing");

  const raw = await searchParams;
  // The drawer became a page (08/11/2026). Every link that still names a
  // customer — a reminder, a bookmark, an old card — lands on that page.
  if (raw.customer) redirect(`/billing/customers/${encodeURIComponent(raw.customer)}`);
  const { status = "all", q = "" } = raw;
  const customer = "";
  const requested = parseListParams(raw);

  const [totals, rows, everyStatus, aging, customerOptions] = await Promise.all([
    billingTotals(ctx.businessId),
    billingCustomers(ctx.businessId, { status, q }),
    // The chips count what each of them would show — under the same search,
    // across every status — so the number is there before the click.
    status === "all"
      ? Promise.resolve(null)
      : billingCustomers(ctx.businessId, { status: "all", q }),
    debtAging(ctx.businessId),
    listCustomerOptions(ctx.businessId),
  ]);
  const counted = everyStatus ?? rows;
  const statusCount = (s: string) => counted.filter((r) => r.status === s).length;

  // The list is computed per customer in code (billingCustomers), so it is
  // paged here, after it is whole — the totals above are of everyone.
  const list = clampPage(requested, rows.length);
  const shown = rows.slice(skipFor(list), skipFor(list) + list.size);
  const sizeKeep = list.size !== DEFAULT_PAGE_SIZE ? String(list.size) : "";
  // Who to call first: since when each row has owed printed money, and when
  // it was last reminded — asked for the rows on screen only.
  const facts = await billingRowFacts(
    ctx.businessId,
    shown.map((r) => r.customerId),
  );
  const now = new Date().getTime();
  const daysSince = (d: Date) => Math.max(0, Math.floor((now - d.getTime()) / 86_400_000));

  /** Toggling a row must not throw away the filters above it. */
  const hrefFor = (next: { status?: string; q?: string; customer?: string }) => {
    // Opening and closing a row keeps the page; changing a filter starts over.
    const keepsPage = next.status === undefined && next.q === undefined;
    const params = new URLSearchParams();
    const merged = { status, q, customer, ...next };
    if (merged.status && merged.status !== "all") params.set("status", merged.status);
    if (merged.q) params.set("q", merged.q);
    if (merged.customer) params.set("customer", merged.customer);
    if (sizeKeep) params.set("size", sizeKeep);
    if (keepsPage && list.page > 1) params.set("page", String(list.page));
    const query = params.toString();
    return query ? `/billing?${query}` : "/billing";
  };

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">גבייה ותשלומים</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        רישום ידני של מה שהתקבל. סטטוס התשלום נגזר מהסכומים ואינו נקבע ביד; &quot;חוב&quot; הוא
        פרסום שכבר יצא ולא שולם.
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="billing-kpis">
        <Kpi label="סה״כ לחיוב" value={totals.billed} testId="kpi-billed" />
        <Kpi label="שולם" value={totals.paid} testId="kpi-paid" tone="text-status-success-fg" />
        {/* 08/11/2026: "open" and "debt" are two numbers. Open is everything
            not yet paid, including weeks that have not printed; debt is the
            printed part of it, and only that one is painted as debt. */}
        <Kpi
          label="יתרה פתוחה"
          value={totals.outstanding}
          testId="kpi-outstanding"
          progress={totals.billed > 0 ? totals.paid / totals.billed : 1}
          note={
            <span className={totals.debt > 0 ? "text-status-debt-fg" : undefined}>
              מתוכה חוב (כבר פורסם): <Ltr data-testid="kpi-debt">{formatMoney(totals.debt)}</Ltr>
            </span>
          }
        />
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4">
          <p className="text-xs text-on-surface-variant">לקוחות עם יתרה</p>
          <p className="mt-1 font-serif text-3xl font-semibold" data-testid="kpi-debtors">
            <Ltr>{totals.customersInDebt}</Ltr>
          </p>
          <p className="mt-1 text-xs text-on-surface-variant">מתוך {totals.customerCount}</p>
          {/* Money the business is HOLDING, not owed. Its own line and not a
              deduction from the debt above: they belong to different people. */}
          {totals.credit > 0 ? (
            <p className="mt-2 text-xs text-status-info-fg" data-testid="kpi-credit">
              לזכות לקוחות: <Ltr>{formatMoney(totals.credit)}</Ltr>
            </p>
          ) : null}
        </div>
      </div>

      {/* Debt by age (08/11/2026). Only what already printed and is unpaid,
          filed by its own print date — the four add up to "מתוכה חוב". */}
      {totals.debt > 0 ? (
        <section className="mb-6" data-testid="debt-aging" aria-label="ותק חובות">
          <h2 className="mb-2 text-sm font-semibold">
            ותק חובות — כמה זמן עבר מאז שהמודעה פורסמה
          </h2>
          <AgingBoxes
            customerHref="/billing/customers"
            buckets={aging.map((bucket) => ({
              key: bucket.key,
              label: bucket.label,
              amount: bucket.amount,
              customers: bucket.customers,
              breakdown: bucket.breakdown.map((c) => ({
                customerId: c.customerId,
                name: c.name,
                amount: c.amount,
                items: c.items.map((line) => ({
                  publicationId: line.publicationId,
                  orderId: line.orderId,
                  orderLabel: orderNumber(line.orderNumber),
                  newspaper: line.newspaper,
                  shape: line.shape,
                  date: formatDate(line.date),
                  open: Math.round(line.open * 100) / 100,
                })),
              })),
            }))}
          />
        </section>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2" data-testid="billing-status-filters">
        <Link href={hrefFor({ status: "all", customer: "" })}>
          <span
            className={cn(
              "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors",
              status === "all"
                ? "bg-primary text-on-primary"
                : "bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant hover:bg-surface-container",
            )}
          >
            כל הסטטוסים
            <span className="ms-2 text-xs opacity-80 tabular-nums">
              <Ltr>{counted.length}</Ltr>
            </span>
          </span>
        </Link>
        {PAYMENT_STATUSES.map((s) => (
          <Link
            key={s}
            href={hrefFor({ status: s, customer: "" })}
            data-testid={`billing-filter-${s}`}
            aria-current={status === s ? "page" : undefined}
          >
            <StatusChip
              tone={PAYMENT_TONE[s]}
              label={PAYMENT_STATUS_LABELS[s]}
              count={statusCount(s)}
              active={status === s}
            />
          </Link>
        ))}
      </div>

      <AutoSubmitForm className="mb-4 flex flex-wrap items-end gap-3" liveText>
        <input type="hidden" name="status" value={status} />
        {sizeKeep ? <input type="hidden" name="size" value={sizeKeep} /> : null}
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="q">
            חיפוש לקוח
          </label>
          <Input id="q" name="q" defaultValue={q} className="w-64" data-testid="billing-search" />
        </div>
        {/* The search applies as one types; Enter still works. */}
        <Button type="submit" variant="secondary" data-testid="billing-apply" className="sr-only">
          סינון
        </Button>
        <div>
          <span className="mb-1 block text-xs text-on-surface-variant">כל לקוח, גם בלי חוב</span>
          <CustomerJump
            customers={customerOptions.map((c) => ({
              id: c.id,
              label: c.business_name,
              owes: counted.find((r) => r.customerId === c.id)?.outstanding ?? 0,
            }))}
          />
        </div>
        <ResetFilters
          href="/billing"
          active={status !== "all" || Boolean(q) || Boolean(customer)}
        />
        <Button variant="ghost" asChild>
          <Link href="/reports">לדוחות</Link>
        </Button>
      </AutoSubmitForm>

      <ListToolbar
        prefix=""
        params={list}
        total={rows.length}
        baseHref={baseHrefFor("/billing", { status: raw.status })}
        searchable={false}
        exportHref={`/api/export/billing?${new URLSearchParams({ status, q })}`}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="אין כרגע מה לגבות"
          body="רק הזמנות מאושרות נספרות כאן. הזמנה בטיוטה עוד לא חייבה אף אחד."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <table className="w-full text-sm" data-testid="billing-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">לקוח</th>
                <th className="p-3 text-start font-semibold">סה״כ לחיוב</th>
                <th className="p-3 text-start font-semibold">שולם</th>
                <th className="p-3 text-start font-semibold">יתרה</th>
                <th className="p-3 text-start font-semibold">ותק החוב</th>
                <th className="p-3 text-start font-semibold">לזכות</th>
                <th className="p-3 text-start font-semibold">סטטוס תשלום</th>
                <th className="p-3 text-start font-semibold">מספר חשבונית</th>
                <th className="p-3 text-start font-semibold" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr
                  key={row.customerId}
                  data-testid={`billing-row-${row.customerId}`}
                  className={cn(
                    "border-t border-outline-variant",
                    // A row with a debt is tinted — the same scheme the
                    // placement board and the close screen already use.
                    row.status === "debt"
                      ? TONE_ROW.debt
                      : row.outstanding > 0
                        ? "bg-status-error-bg/20"
                        : "hover:bg-surface-container-low",
                  )}
                >
                  <td className="p-3 font-medium">
                    <Link
                      href={`/customers/${row.customerId}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.label}
                    </Link>
                    {/* When they were last chased — under the name, not a
                        tenth column: every column added here is paid for by
                        the narrowest one (the "ריש תשל" lesson). */}
                    <span
                      className="block text-xs font-normal text-on-surface-variant"
                      data-testid={`billing-last-reminder-${row.customerId}`}
                    >
                      {facts.get(row.customerId)?.lastReminder ? (
                        <>
                          תזכורת אחרונה לפני{" "}
                          <Ltr>{daysSince(facts.get(row.customerId)!.lastReminder!)}</Ltr> ימים
                        </>
                      ) : (
                        "לא נשלחה תזכורת"
                      )}
                    </span>
                  </td>
                  <td className="p-3">
                    <Ltr>{formatMoney(row.billed)}</Ltr>
                  </td>
                  <td className="p-3 text-status-success-fg">
                    <Ltr data-testid={`billing-paid-${row.customerId}`}>
                      {formatMoney(row.paid)}
                    </Ltr>
                  </td>
                  <td className="p-3 font-semibold">
                    <Ltr data-testid={`billing-outstanding-${row.customerId}`}>
                      {formatMoney(row.outstanding)}
                    </Ltr>
                    {row.debt > 0 ? (
                      <span
                        className="block text-xs font-normal text-status-debt-fg"
                        data-testid={`billing-debt-${row.customerId}`}
                      >
                        חוב <Ltr>{formatMoney(row.debt)}</Ltr>
                      </span>
                    ) : null}
                  </td>
                  <td className="p-3">
                    <DebtAge
                      days={
                        facts.get(row.customerId)?.debtSince
                          ? daysSince(facts.get(row.customerId)!.debtSince!)
                          : null
                      }
                      testId={`billing-debt-age-${row.customerId}`}
                    />
                  </td>
                  <td className="p-3">
                    {row.credit > 0 ? (
                      <Ltr
                        className="text-status-info-fg"
                        data-testid={`billing-credit-${row.customerId}`}
                      >
                        {formatMoney(row.credit)}
                      </Ltr>
                    ) : (
                      <span className="text-xs text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge
                      tone={PAYMENT_TONE[row.status]}
                      data-testid={`billing-status-${row.customerId}`}
                    >
                      {PAYMENT_STATUS_LABELS[row.status]}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {row.invoiceNumbers.length > 0 ? (
                      <Ltr className="font-mono text-xs">{row.invoiceNumbers.join(", ")}</Ltr>
                    ) : (
                      <span className="text-xs text-on-surface-variant">—</span>
                    )}
                  </td>
                  {/* whitespace-nowrap: the table has eight columns and the
                        browser pays for the widest one by wrapping the last —
                        which chopped "רישום תשלום" to "ריש תשל". A control
                        whose label is cut in half is a control nobody trusts. */}
                  <td className="p-3 text-end whitespace-nowrap">
                    {/* A button, and one that says what it opens.
                          It was a small underlined "תשלומים" at the far end of
                          the row — the least prominent thing in it, for the one
                          act the whole screen exists to perform. */}
                    <Button
                      variant={row.outstanding > 0 ? "primary" : "secondary"}
                      size="sm"
                      asChild
                    >
                      <Link
                        href={`/billing/customers/${row.customerId}`}
                        data-testid={`billing-expand-${row.customerId}`}
                      >
                        <Wallet className="size-4" />
                        {/* What the click leads to depends on whether there is
                              anything to collect. */}
                        {row.outstanding > 0 ? "רישום תשלום" : "פירוט תשלומים"}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        <ListPager
          prefix=""
          params={list}
          total={rows.length}
          baseHref={baseHrefFor("/billing", { status: raw.status })}
        />
      ) : null}
    </>
  );
}

function Kpi({
  label,
  value,
  testId,
  tone,
  progress,
  note,
}: {
  label: string;
  value: number;
  testId: string;
  tone?: string;
  progress?: number;
  note?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className={cn("mt-1 font-serif text-3xl font-semibold", tone)} data-testid={testId}>
        <Ltr>{formatMoney(value)}</Ltr>
      </p>
      {progress !== undefined ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-container">
          <div
            className="h-full bg-status-success-fg"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
          />
        </div>
      ) : null}
      {note ? <p className="mt-2 text-xs">{note}</p> : null}
    </div>
  );
}

/**
 * How long printed money has been owed, as a bar and in days — who to call
 * first, read without reading dates. Blue under a month, orange to two, red
 * past that; no bar at all when nothing printed is unpaid.
 */
function DebtAge({ days, testId }: { days: number | null; testId: string }) {
  if (days === null) {
    return (
      <span className="text-xs text-on-surface-variant" data-testid={testId}>
        אין חוב
      </span>
    );
  }
  const tone = days > 60 ? "bg-status-error-fg" : days > 30 ? "bg-status-warning-fg" : "bg-primary";
  return (
    <span className="flex items-center gap-2 whitespace-nowrap" data-testid={testId}>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-container-high">
        <span
          className={cn("block h-full rounded-full", tone)}
          style={{ width: `${Math.min(100, Math.round((days / 90) * 100))}%` }}
        />
      </span>
      <span className="text-xs text-on-surface">
        <Ltr>{days}</Ltr> ימים
      </span>
    </span>
  );
}
