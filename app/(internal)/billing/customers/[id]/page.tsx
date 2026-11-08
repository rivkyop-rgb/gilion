import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FileText, UserRound } from "lucide-react";

import { EmailLink, PhoneLink } from "@/components/contact-links";
import { CreditBlockBanner } from "@/components/billing/credit-block-banner";
import { creditState } from "@/lib/data/credit-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { PAYMENT_TONE } from "@/components/status-tone";
import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { billingContactsOf, getCustomer, listCustomerOptions } from "@/lib/data/customers";
import {
  billableOrders,
  billingCustomers,
  customerAccount,
  customerCredit,
  customerMonths,
  paymentCoverage,
  paymentHistory,
  paymentsForCustomer,
} from "@/lib/data/payments";
import { describeDelta } from "@/lib/domain/payment-delta";
import { coveragePhrase } from "@/lib/domain/payment-report";
import { PAYMENT_STATUS_LABELS } from "@/lib/domain/payment-status";
import { cn } from "@/lib/utils";
import { formatMoney, orderNumber } from "../../../orders/format";
import { PaymentEditor, type HistoryEntry, type PaymentRow } from "../../payment-editor";
import { CustomerJump } from "../../customer-jump";

export const metadata: Metadata = { title: "גבייה ללקוח · Gilion" };

/** How far back the history dialog shows before asking — a display window only. */
const HISTORY_MONTHS = 6;

const DATE_TIME = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});

/**
 * One customer's billing, on a page of its own (08/11/2026).
 *
 * It was a drawer over the billing list, and the user said it plainly: "נפתח
 * מין לוח בצד — לא נח ולא ברור, ושם מכניסים תשלום. למה שלא יהיה עמוד נח, נחמד
 * ונגיש?". A page has a URL of its own, room for the form beside the months,
 * and a Back button that does what people expect. `?customer=X` on the list
 * still works — it redirects here — so every old link lands in the same place.
 *
 * Any customer can be opened, not only those with money on the books: a
 * payment that arrives before the order is approved is recorded as credit.
 */
export default async function CustomerBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing");
  const { id } = await params;

  const customer = await getCustomer(ctx.businessId, id);
  if (!customer) notFound();
  const mayWrite = canWriteArea(ctx, "billing");

  const historyCutoff = new Date();
  historyCutoff.setMonth(historyCutoff.getMonth() - HISTORY_MONTHS);

  const [everyone, orders, payments, monthly, billingContacts, { account }, credit, options, cover] =
    await Promise.all([
      billingCustomers(ctx.businessId, { status: "all" }),
      billableOrders(ctx.businessId, id),
      paymentsForCustomer(ctx.businessId, id),
      customerMonths(ctx.businessId, id),
      billingContactsOf(ctx.businessId, id),
      customerAccount(ctx.businessId, id),
      customerCredit(ctx.businessId, id),
      listCustomerOptions(ctx.businessId),
      paymentCoverage(ctx.businessId, id),
    ]);
  const row = everyone.find((r) => r.customerId === id) ?? null;
  // The list's own number when the customer is on it — the page must never
  // quote a balance the row it was opened from disagrees with.
  const outstanding = row?.outstanding ?? account.outstanding;
  const debt = row?.debt ?? account.ranOpen;

  const block = await creditState(ctx.businessId, id);
  const history = await paymentHistory(
    ctx.businessId,
    payments.map((p) => p.id),
    id,
  );
  const orderLabels = new Map(orders.map((o) => [o.id, orderNumber(o.number)]));
  const paymentRows: PaymentRow[] = payments.map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    paymentDate: p.payment_date ? p.payment_date.toISOString().slice(0, 10) : "",
    invoiceNumber: p.external_invoice_number ?? "",
    canceled: p.status === "canceled",
    orderId: p.order_id,
    orderLabel: p.order_id
      ? (orderLabels.get(p.order_id) ?? orderNumber(p.order?.number ?? 0))
      : null,
    groupId: p.group_id,
    covers: p.order_id
      ? coveragePhrase(cover.get(p.id) ?? [], dayMonth, formatMoney)
      : "לא שויך להזמנה — נזקף לזכות הלקוח",
    updatedBy: p.updated_by.name,
    updatedAt: DATE_TIME.format(p.updated_at),
  }));
  const historyEntries: HistoryEntry[] = history.map((entry) => ({
    id: entry.id,
    at: DATE_TIME.format(entry.created_at),
    by: entry.user.name,
    text: describeDelta(entry.old_value, entry.new_value),
    withinWindow: entry.created_at >= historyCutoff,
  }));

  // Previous / next among the customers who owe — the order the list shows
  // them in, so working down the list does not mean going back to it.
  const owing = everyone.filter((r) => r.outstanding > 0);
  const at = owing.findIndex((r) => r.customerId === id);
  const prev = at > 0 ? owing[at - 1] : null;
  const next = at >= 0 && at < owing.length - 1 ? owing[at + 1] : null;

  const contacts = billingContacts.filter((c) => c.phone || c.email);

  return (
    <div data-testid={`billing-open-${id}`}>
      <nav
        className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm"
        aria-label="ניווט בגבייה"
      >
        <Link
          href="/billing"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
          data-testid="close-payment-dialog"
        >
          <ChevronRight className="size-4" aria-hidden />
          כל הגבייה
        </Link>
        <span className="flex flex-wrap items-center gap-2">
          {prev ? (
            <Link
              href={`/billing/customers/${prev.customerId}`}
              className="rounded-lg px-2 py-1 text-on-surface-variant hover:bg-surface-container"
              data-testid="billing-prev-customer"
            >
              → {prev.label}
            </Link>
          ) : null}
          {next ? (
            <Link
              href={`/billing/customers/${next.customerId}`}
              className="rounded-lg px-2 py-1 text-on-surface-variant hover:bg-surface-container"
              data-testid="billing-next-customer"
            >
              {next.label} ←
            </Link>
          ) : null}
          <CustomerJump customers={everyoneOptions(everyone, options)} />
        </span>
      </nav>

      {block.blocked ? (
        <CreditBlockBanner
          customerId={id}
          reason={block.reason}
          releaseWaiting={block.releaseWaiting}
          mayRelease={ctx.role === "admin" || ctx.isSuperAdmin}
        />
      ) : null}

      <header className="mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="page-title font-serif text-headline-lg font-semibold">
              {customer.business_name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-on-surface-variant">
              {row ? (
                <Badge tone={PAYMENT_TONE[row.status]} data-testid={`billing-status-${id}`}>
                  {PAYMENT_STATUS_LABELS[row.status]}
                </Badge>
              ) : null}
              {contacts.length > 0 ? (
                <span
                  className="flex flex-wrap items-center gap-x-3"
                  data-testid="billing-contacts"
                >
                  {contacts.map((c) => (
                    <span key={c.label} className="flex flex-wrap items-center gap-x-2">
                      <span>{c.label}:</span>
                      {c.phone ? <PhoneLink phone={c.phone} /> : null}
                      {c.email ? <EmailLink email={c.email} /> : null}
                    </span>
                  ))}
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <a href={`/api/export/statement/${id}`} data-testid="billing-page-statement">
                <FileText className="size-4" aria-hidden />
                דף חשבון (PDF)
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/customers/${id}`} data-testid="billing-page-card">
                <UserRound className="size-4" aria-hidden />
                כרטיס הלקוח
              </Link>
            </Button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="סה״כ לחיוב" value={row?.billed ?? account.billed} />
          <Figure
            label="שולם"
            value={row?.paid ?? account.settled}
            tone="text-status-success-fg"
            testId={`billing-paid-${id}`}
          />
          <Figure
            label="נותר לתשלום"
            value={outstanding}
            testId={`billing-outstanding-${id}`}
            tone={outstanding > 0 ? "text-status-error-fg" : undefined}
            note={debt > 0 ? `מתוכו חוב (כבר פורסם): ${formatMoney(debt)}` : undefined}
          />
          <Figure
            label="לזכות הלקוח"
            value={credit}
            tone="text-status-info-fg"
            // Only when there is any: "no credit" is asserted as no element.
            testId={credit > 0 ? `billing-credit-${id}` : undefined}
          />
        </dl>
      </header>

      <PaymentEditor
        layout="page"
        customerId={id}
        outstanding={outstanding}
        credit={credit}
        mayWrite={mayWrite}
        orders={orders.map((o) => ({
          id: o.id,
          label: orderNumber(o.number),
          totalPrice: o.totalPrice,
          paid: o.paid,
          open: o.open,
          paymentStatus: o.paymentStatus,
        }))}
        months={monthly.months}
        payments={paymentRows}
        history={historyEntries}
        historyMonths={HISTORY_MONTHS}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
  note,
  testId,
}: {
  label: string;
  value: number;
  tone?: string;
  note?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-container-low p-3">
      <dt className="text-xs text-on-surface-variant">{label}</dt>
      <dd className={cn("mt-1 text-xl font-semibold", tone)} data-testid={testId}>
        <Ltr>{formatMoney(value)}</Ltr>
      </dd>
      {note ? <dd className="mt-1 text-xs text-status-debt-fg">{note}</dd> : null}
    </div>
  );
}

/** 29.10 — the way the months table and the publications under it write a day. */
function dayMonth(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "numeric",
    timeZone: "Asia/Jerusalem",
  }).format(date);
}

/** Every customer for the jump box, with what each owes beside the name. */
function everyoneOptions(
  rows: Awaited<ReturnType<typeof billingCustomers>>,
  customers: Array<{ id: string; business_name: string }>,
) {
  const owe = new Map(rows.map((r) => [r.customerId, r.outstanding]));
  return customers.map((c) => ({ id: c.id, label: c.business_name, owes: owe.get(c.id) ?? 0 }));
}
