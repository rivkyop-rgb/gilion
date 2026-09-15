import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown, Wallet } from "lucide-react";

import { getTenantContext, canWriteArea, requireArea } from "@/lib/auth/tenant";
import {
  billableOrders,
  billingCustomers,
  billingTotals,
  customerMonths,
  paymentHistory,
  paymentsForCustomer,
} from "@/lib/data/payments";
import { PAYMENT_STATUSES, PAYMENT_STATUS_LABELS } from "@/lib/domain/payment-status";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { PAYMENT_TONE, TONE_ROW } from "@/components/status-tone";
import { cn } from "@/lib/utils";
import { formatMoney, orderNumber } from "../orders/format";
import { StatusChip } from "../orders/order-badges";
import { PaymentEditor, type HistoryEntry, type PaymentRow } from "./payment-editor";

export const metadata: Metadata = { title: "גבייה · Gilion" };

/**
 * How far back the history dialog shows before asking.
 *
 * A display window, NOT a retention policy: `AuditLog` has no delete path by
 * design (conventions.md §6), and nothing here removes a row. Six months is
 * simply what somebody is looking for when they open the dialog; older entries
 * are one click away.
 */
const HISTORY_MONTHS = 6;

const DATE_TIME = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});

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
  searchParams: Promise<{ status?: string; q?: string; customer?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing");

  const { status = "all", q = "", customer = "" } = await searchParams;
  const mayWrite = canWriteArea(ctx, "billing");

  const historyCutoff = new Date();
  historyCutoff.setMonth(historyCutoff.getMonth() - HISTORY_MONTHS);

  const [totals, rows] = await Promise.all([
    billingTotals(ctx.businessId),
    billingCustomers(ctx.businessId, { status, q }),
  ]);

  const open = rows.find((r) => r.customerId === customer) ?? null;

  /** Toggling a row must not throw away the filters above it. */
  const hrefFor = (next: { status?: string; q?: string; customer?: string }) => {
    const params = new URLSearchParams();
    const merged = { status, q, customer, ...next };
    if (merged.status && merged.status !== "all") params.set("status", merged.status);
    if (merged.q) params.set("q", merged.q);
    if (merged.customer) params.set("customer", merged.customer);
    const query = params.toString();
    return query ? `/billing?${query}` : "/billing";
  };

  const [orders, payments, monthly] = open
    ? await Promise.all([
        billableOrders(ctx.businessId, open.customerId),
        paymentsForCustomer(ctx.businessId, open.customerId),
        customerMonths(ctx.businessId, open.customerId),
      ])
    : [[], [], { months: [], totals: { billed: 0, paid: 0, open: 0 } }];

  // The trail is keyed by the payment ids that exist now plus the customer
  // itself — a record CREATED is logged against the customer, because at the
  // moment the audit row is written the payment has no id yet to be logged
  // against.
  const history = open
    ? await paymentHistory(
        ctx.businessId,
        payments.map((p) => p.id),
        open.customerId,
      )
    : [];

  const orderLabels = new Map(orders.map((o) => [o.id, orderNumber(o.id)]));

  const credit = open?.credit ?? 0;

  const paymentRows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    paymentDate: p.payment_date ? p.payment_date.toISOString().slice(0, 10) : "",
    invoiceNumber: p.external_invoice_number ?? "",
    canceled: p.status === "canceled",
    orderId: p.order_id,
    orderLabel: p.order_id ? (orderLabels.get(p.order_id) ?? orderNumber(p.order_id)) : null,
    groupId: p.group_id,
    updatedBy: p.updated_by.name,
    updatedAt: DATE_TIME.format(p.updated_at),
  }));

  // The audit rows, shaped for the dialog. The delta is turned into a sentence
  // HERE and not in the client component: it reads two JSON blobs and formats
  // money, and neither belongs in a bundle the browser has to download.
  const historyEntries: HistoryEntry[] = history.map((entry) => ({
    id: entry.id,
    at: DATE_TIME.format(entry.created_at),
    by: entry.user.name,
    text: describeDelta(entry.old_value, entry.new_value),
    withinWindow: entry.created_at >= historyCutoff,
  }));

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">גבייה ותשלומים</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        רישום ידני של מה שהתקבל. סטטוס התשלום נגזר מהסכומים ואינו נקבע ביד; &quot;חוב&quot; הוא
        פרסום שכבר יצא ולא שולם.
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="billing-kpis">
        <Kpi label="סה״כ לחיוב" value={totals.billed} testId="kpi-billed" />
        <Kpi label="שולם" value={totals.paid} testId="kpi-paid" tone="text-status-success-fg" />
        <Kpi
          label="יתרת חוב"
          value={totals.outstanding}
          testId="kpi-outstanding"
          tone="text-status-debt-fg"
          progress={totals.billed > 0 ? totals.paid / totals.billed : 1}
        />
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
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
              active={status === s}
            />
          </Link>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="status" value={status} />
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="q">
            חיפוש לקוח
          </label>
          <Input id="q" name="q" defaultValue={q} className="w-64" data-testid="billing-search" />
        </div>
        <Button type="submit" variant="secondary" data-testid="billing-apply">
          סינון
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/reports">לדוחות</Link>
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title="אין כרגע מה לגבות"
          body="רק הזמנות מאושרות נספרות כאן. הזמנה בטיוטה עוד לא חייבה אף אחד."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-sm" data-testid="billing-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">לקוח</th>
                <th className="p-3 text-start font-semibold">סה״כ לחיוב</th>
                <th className="p-3 text-start font-semibold">שולם</th>
                <th className="p-3 text-start font-semibold">יתרה</th>
                <th className="p-3 text-start font-semibold">לזכות</th>
                <th className="p-3 text-start font-semibold">סטטוס תשלום</th>
                <th className="p-3 text-start font-semibold">מספר חשבונית</th>
                <th className="p-3 text-start font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = open?.customerId === row.customerId;
                return [
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
                        variant={isOpen ? "ghost" : row.outstanding > 0 ? "primary" : "secondary"}
                        size="sm"
                        asChild
                      >
                        <Link
                          href={hrefFor({ customer: isOpen ? "" : row.customerId })}
                          data-testid={`billing-expand-${row.customerId}`}
                          aria-expanded={isOpen}
                        >
                          {isOpen ? (
                            <>
                              <ChevronDown className="size-4" />
                              סגירה
                            </>
                          ) : (
                            <>
                              <Wallet className="size-4" />
                              {/* What the click leads to depends on whether
                                  there is anything to collect. */}
                              {row.outstanding > 0 ? "רישום תשלום" : "פירוט תשלומים"}
                            </>
                          )}
                        </Link>
                      </Button>
                    </td>
                  </tr>,
                  isOpen ? (
                    <tr
                      key={`${row.customerId}-open`}
                      data-testid={`billing-open-${row.customerId}`}
                    >
                      <td
                        colSpan={7}
                        className="border-t border-outline-variant bg-surface-container-low/50 p-4"
                      >
                        <PaymentEditor
                          customerId={row.customerId}
                          mayWrite={mayWrite}
                          orders={orders.map((o) => ({
                            id: o.id,
                            label: orderNumber(o.id),
                            totalPrice: o.totalPrice,
                            paid: o.paid,
                            open: o.open,
                            paymentStatus: o.paymentStatus,
                          }))}
                          months={monthly.months}
                          payments={paymentRows}
                          credit={credit}
                          outstanding={row.outstanding}
                          history={historyEntries}
                          historyMonths={HISTORY_MONTHS}
                        />
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Kpi({
  label,
  value,
  testId,
  tone,
  progress,
}: {
  label: string;
  value: number;
  testId: string;
  tone?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-4">
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
    </div>
  );
}

/**
 * The audit delta, as a sentence (US-010 AC-5).
 *
 * Reads the two JSON blobs the log already holds rather than storing a second,
 * human-readable copy — one of them would eventually be the one that is wrong.
 */
function describeDelta(oldValue: unknown, newValue: unknown): string {
  const before = (oldValue ?? {}) as Record<string, unknown>;
  const after = (newValue ?? {}) as Record<string, unknown>;

  // Phrased as nouns rather than verbs on purpose: Hebrew verbs carry gender,
  // the line already names the person, and "רשם" under a woman's name is the
  // product telling her she is somebody else.
  // A CREATION is `old: null` — both shapes of it. Keyed on that rather than on
  // a field only one shape carries: the split path writes no `payment_id` (it
  // creates several rows, not one), and sniffing for that field sent every
  // split down the "update" branch, which then compared its amount against a
  // missing old value and printed "עדכון סכום ₪0.00 ← ₪300.00".
  if (oldValue === null) {
    const amount = formatMoney(Number(after["amount"] ?? 0));
    const across = Number(after["split_across"] ?? 0);
    const credit = Number(after["credit"] ?? 0);
    if (across > 1) {
      return credit > 0
        ? `רישום תשלום של ${amount}, מפוצל בין ${across} הזמנות ועוד ${formatMoney(credit)} ליתרה`
        : `רישום תשלום של ${amount}, מפוצל בין ${across} הזמנות`;
    }
    return credit > 0 && across === 0
      ? `רישום תשלום של ${amount} ליתרת הלקוח`
      : `רישום תשלום של ${amount}`;
  }
  if (after["credit_applied"] !== undefined) {
    return `שיוך ${formatMoney(Number(after["credit_applied"] ?? 0))} מיתרת הלקוח להזמנה`;
  }
  if (typeof after["status"] === "string") {
    return after["status"] === "canceled" ? "ביטול רישום תשלום" : "החזרת רישום שבוטל";
  }

  const parts: string[] = [];
  if (before["amount"] !== after["amount"]) {
    parts.push(
      `סכום ${formatMoney(Number(before["amount"] ?? 0))} ← ${formatMoney(Number(after["amount"] ?? 0))}`,
    );
  }
  if (before["payment_date"] !== after["payment_date"]) {
    parts.push(
      `תאריך ${String(before["payment_date"] ?? "—")} ← ${String(after["payment_date"] ?? "—")}`,
    );
  }
  if (before["external_invoice_number"] !== after["external_invoice_number"]) {
    parts.push(
      `חשבונית ${String(before["external_invoice_number"] ?? "—")} ← ${String(after["external_invoice_number"] ?? "—")}`,
    );
  }
  if (before["order_id"] !== after["order_id"]) parts.push("שיוך מחדש להזמנה אחרת");
  return parts.length > 0 ? `עדכון ${parts.join(" · ")}` : "עדכון רישום תשלום";
}
