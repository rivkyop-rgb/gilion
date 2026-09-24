"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, ChevronDown, ChevronLeft, History, RotateCcw, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/payment-status";
import { positionLabel } from "@/lib/domain/payment-allocation";
import { openMonthsPhrase, type MonthRow } from "@/lib/domain/payment-months";
import { MonthTable } from "@/components/billing/month-table";
import { PAYMENT_TONE } from "@/components/status-tone";
import { cn } from "@/lib/utils";
import {
  cancelPaymentAction,
  previewAllocationAction,
  recordPaymentAction,
  updatePaymentAction,
  type PaymentActionState,
} from "./actions";

export type BillableOrder = {
  id: string;
  label: string;
  totalPrice: number;
  paid: number;
  open: number;
  paymentStatus: PaymentStatus;
};

export type PaymentRow = {
  id: string;
  amount: number;
  paymentDate: string;
  invoiceNumber: string;
  canceled: boolean;
  orderId: string | null;
  orderLabel: string | null;
  /** Set when this row was one slice of a payment split across orders. */
  groupId: string | null;
  updatedBy: string;
  updatedAt: string;
};

export type HistoryEntry = {
  id: string;
  at: string;
  by: string;
  text: string;
  withinWindow: boolean;
};

const MONEY = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });

/**
 * Recording and correcting payments for one customer (US-010 AC-4).
 *
 * Three things share this panel, in the order somebody works in: what is open
 * per order, the form that settles it, and the records already made. The audit
 * trail used to sit at the bottom as a fourth list and pushed the work off the
 * screen — it is a dialog now, opened when somebody asks "who changed this",
 * which is the only time it is the question.
 */
export function PaymentEditor({
  customerId,
  orders,
  months,
  payments,
  credit,
  outstanding,
  history,
  historyMonths,
  mayWrite,
}: {
  customerId: string;
  orders: BillableOrder[];
  months: MonthRow[];
  payments: PaymentRow[];
  credit: number;
  outstanding: number;
  history: HistoryEntry[];
  historyMonths: number;
  mayWrite: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Which existing record is open for editing, if any. */
  const [editing, setEditing] = useState<string | null>(null);

  const run = (fn: () => Promise<PaymentActionState>, onOk?: () => void) => {
    setError(null);
    setNote(null);
    start(async () => {
      const result = await fn();
      if (result.message) {
        setError(result.message);
        return;
      }
      setNote(result.note ?? "נשמר");
      onOk?.();
      router.refresh();
    });
  };

  const net = outstanding - credit;

  return (
    <div className="space-y-6" data-testid={`payment-editor-${customerId}`}>
      {/* --- what is open, month by month ---------------------------------- */}
      <div>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            {/* The BALANCE is not repeated here — the window's header carries
                it, and a number printed twice on one screen is a number the
                reader stops to compare. */}
            <h4 className="text-sm font-semibold">מה פתוח, לפי חודש</h4>
            {/* The sentence somebody reads out on the phone. The table under it
                is the detail; this is the answer. */}
            <p className="text-xs text-on-surface-variant" data-testid="open-months-phrase">
              {openMonthsPhrase(months)}
            </p>
          </div>
          <HistoryDialog entries={history} months={historyMonths} />
        </div>

        {months.length === 0 ? (
          <p className="text-sm text-on-surface-variant" data-testid="no-billable-orders">
            אין ללקוח הזה הזמנה מאושרת.
          </p>
        ) : (
          <MonthTable customerId={customerId} months={months} />
        )}

        {/* The credit, never folded into "שולם" above — it is money against
            nothing, and netting it into that column would push it past "לחיוב"
            and make the row unreadable. */}
        {credit > 0 ? (
          <p
            className="mt-2 rounded-sm bg-status-info-bg px-3 py-2 text-sm text-status-info-fg"
            data-testid="customer-credit"
          >
            יתרה לזכות הלקוח: <Ltr className="font-semibold">{MONEY.format(credit)}</Ltr> — כסף
            שהתקבל ואינו משויך להזמנה.
            {/* The net only earns its place when it says something the two
                numbers above do not. With nothing owed it IS the credit, and
                printing it again reads as two different facts that happen to
                match. */}
            {outstanding > 0 ? (
              <span data-testid="customer-net">
                {" "}
                {positionLabel(net)}: <Ltr>{MONEY.format(Math.abs(net))}</Ltr>
              </span>
            ) : null}
          </p>
        ) : null}

        {orders.length > 0 ? <OrderBalances customerId={customerId} orders={orders} /> : null}
      </div>

      {mayWrite ? (
        <NewPaymentForm
          customerId={customerId}
          orders={orders}
          busy={busy}
          onSubmit={(values, reset) =>
            run(() => recordPaymentAction({ customerId, ...values }), reset)
          }
        />
      ) : null}

      {error ? <InlineError>{error}</InlineError> : null}
      {note ? (
        <p
          role="status"
          data-testid="payment-note"
          className="rounded-sm bg-status-success-bg px-3 py-2 text-sm text-status-success-fg"
        >
          {note}
        </p>
      ) : null}

      <div>
        <h4 className="mb-2 text-sm font-semibold">רישומי תשלום</h4>
        {payments.length === 0 ? (
          <p className="text-sm text-on-surface-variant" data-testid="no-payments">
            עוד לא נרשם תשלום ללקוח הזה.
          </p>
        ) : (
          <table className="w-full text-sm" data-testid={`payment-list-${customerId}`}>
            <thead>
              <tr className="text-xs text-on-surface-variant">
                <th className="p-2 text-start font-medium">סכום</th>
                <th className="p-2 text-start font-medium">תאריך</th>
                <th className="p-2 text-start font-medium">חשבונית</th>
                <th className="p-2 text-start font-medium">שיוך</th>
                <th className="p-2 text-start font-medium">עודכן</th>
                {mayWrite ? <th className="p-2 text-start font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) =>
                editing === p.id ? (
                  <tr key={p.id} data-testid={`payment-edit-${p.id}`}>
                    <td colSpan={mayWrite ? 6 : 5} className="p-2">
                      <EditPaymentForm
                        payment={p}
                        orders={orders}
                        busy={busy}
                        onCancel={() => setEditing(null)}
                        onSubmit={(values) =>
                          run(
                            () => updatePaymentAction(p.id, values),
                            () => setEditing(null),
                          )
                        }
                      />
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={p.id}
                    data-testid={`payment-row-${p.id}`}
                    className={cn(
                      "border-t border-outline-variant",
                      // A cancelled record stays visible and stops counting
                      // (rule 10) — struck through is how that reads at a glance.
                      p.canceled && "text-on-surface-variant line-through opacity-70",
                    )}
                  >
                    <td className="p-2 font-medium">
                      <Ltr data-testid={`payment-amount-${p.id}`}>{MONEY.format(p.amount)}</Ltr>
                    </td>
                    <td className="p-2">
                      {p.paymentDate ? <Ltr>{p.paymentDate}</Ltr> : <span>—</span>}
                    </td>
                    <td className="p-2">
                      {p.invoiceNumber ? (
                        <Ltr className="font-mono text-xs">{p.invoiceNumber}</Ltr>
                      ) : (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </td>
                    <td className="p-2 text-xs">
                      {p.orderLabel ? (
                        <Ltr className="font-mono">{p.orderLabel}</Ltr>
                      ) : (
                        "יתרת הלקוח"
                      )}
                      {/* Says out loud that this row is a slice of one bigger
                          payment — otherwise three rows of ₪2,000 read as three
                          separate payments nobody remembers making. */}
                      {p.groupId ? (
                        <span
                          className="ms-1 text-on-surface-variant"
                          data-testid={`payment-part-of-${p.id}`}
                        >
                          · חלק מתשלום מפוצל
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2 text-xs text-on-surface-variant">
                      {p.updatedBy} · <Ltr>{p.updatedAt}</Ltr>
                    </td>
                    {mayWrite ? (
                      <td className="p-2">
                        <span className="flex gap-1">
                          {p.canceled ? null : (
                            <Button
                              size="sm"
                              variant="ghost"
                              data-testid={`edit-payment-${p.id}`}
                              onClick={() => setEditing(p.id)}
                            >
                              עריכה
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            data-testid={`cancel-payment-${p.id}`}
                            title={
                              p.groupId
                                ? "התשלום נפרס על כמה הזמנות — הביטול יחול על כולן"
                                : undefined
                            }
                            onClick={() => run(() => cancelPaymentAction(p.id))}
                          >
                            {p.canceled ? (
                              <>
                                <RotateCcw className="size-3.5" />
                                החזרה
                              </>
                            ) : (
                              <>
                                <X className="size-3.5" />
                                ביטול
                              </>
                            )}
                          </Button>
                        </span>
                      </td>
                    ) : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/**
 * The same money by ORDER, folded away.
 *
 * Kept and not deleted, because a payment attaches to an order and naming one
 * is a real thing somebody does — a customer who says "this is for the invoice
 * you sent me" is naming an order. It is simply not the first question, so it
 * is not the first table.
 */
function OrderBalances({ customerId, orders }: { customerId: string; orders: BillableOrder[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3">
      <Button
        variant="ghost"
        size="sm"
        data-testid="toggle-order-balances"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
        פירוט לפי הזמנה
        <span className="ltr-isolate text-xs opacity-70">{orders.length}</span>
      </Button>

      {open ? (
        <table className="mt-1 w-full text-sm" data-testid={`order-balances-${customerId}`}>
          <thead>
            <tr className="text-xs text-on-surface-variant">
              <th className="p-2 text-start font-medium">הזמנה</th>
              <th className="p-2 text-start font-medium">לחיוב</th>
              <th className="p-2 text-start font-medium">שולם</th>
              <th className="p-2 text-start font-medium">נותר</th>
              <th className="p-2 text-start font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr
                key={o.id}
                data-testid={`order-balance-${o.id}`}
                className={cn(
                  "border-t border-outline-variant",
                  o.open > 0 ? "" : "text-on-surface-variant",
                )}
              >
                <td className="p-2 font-mono text-xs">
                  <Ltr>{o.label}</Ltr>
                </td>
                <td className="p-2">
                  <Ltr>{MONEY.format(o.totalPrice)}</Ltr>
                </td>
                <td className="p-2 text-status-success-fg">
                  <Ltr data-testid={`order-paid-${o.id}`}>{MONEY.format(o.paid)}</Ltr>
                </td>
                <td className="p-2 font-semibold">
                  <Ltr data-testid={`order-open-${o.id}`}>{MONEY.format(o.open)}</Ltr>
                </td>
                <td className="p-2">
                  <Badge tone={PAYMENT_TONE[o.paymentStatus]}>
                    {PAYMENT_STATUS_LABELS[o.paymentStatus]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/**
 * The audit trail, on request.
 *
 * It was a fourth list at the bottom of the panel and pushed the work off the
 * screen. It answers one question — who changed this and what was it before —
 * and that question is asked rarely, so it opens rather than sits.
 *
 * The default window is recent; older entries are behind a toggle and are NOT
 * deleted. `AuditLog` is append-only by design (conventions.md §6): it is the
 * evidence that a number was changed, and evidence that expires is not evidence.
 */
function HistoryDialog({ entries, months }: { entries: HistoryEntry[]; months: number }) {
  const [all, setAll] = useState(false);
  const recent = entries.filter((e) => e.withinWindow);
  const shown = all ? entries : recent;
  const hidden = entries.length - recent.length;

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="sm" data-testid="open-payment-history">
          <History className="size-4" />
          היסטוריית עדכונים
          {entries.length > 0 ? (
            <span className="ltr-isolate text-xs opacity-70">{entries.length}</span>
          ) : null}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid="payment-history-dialog"
          // Same centring as confirm-dialog.tsx: inset-x-0 + mx-auto, which
          // needs no RTL special case and no `left-`/`right-` utility. The
          // translate pair this replaced had to name both directions and was a
          // second way of doing something the codebase had already settled.
          className="fixed inset-x-0 top-1/2 z-50 mx-auto max-h-[80dvh] w-[min(40rem,calc(100vw-2rem))] -translate-y-1/2 overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-6 shadow-elevation-2"
        >
          <DialogPrimitive.Title className="mb-1 font-serif text-xl font-semibold">
            היסטוריית עדכונים
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mb-4 text-sm text-on-surface-variant">
            מי שינה, מתי, ומה היה הערך הקודם. נרשם ביומן הביקורת ואינו נמחק.
          </DialogPrimitive.Description>

          {shown.length === 0 ? (
            <p className="text-sm text-on-surface-variant" data-testid="no-history">
              אין שינויים ב־{months} החודשים האחרונים.
            </p>
          ) : (
            <ul className="space-y-2 text-sm" data-testid="payment-history">
              {shown.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap gap-2 border-b border-outline-variant pb-2 last:border-0"
                >
                  <Ltr className="font-mono text-xs text-on-surface-variant">{entry.at}</Ltr>
                  <span className="font-medium">{entry.by}</span>
                  <span className="text-on-surface-variant">{entry.text}</span>
                </li>
              ))}
            </ul>
          )}

          {hidden > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="mt-3"
              data-testid="toggle-history-window"
              onClick={() => setAll((v) => !v)}
            >
              {all ? `${months} החודשים האחרונים בלבד` : `הצגת הכול (עוד ${hidden})`}
            </Button>
          ) : null}

          <div className="mt-4 flex justify-end">
            <DialogPrimitive.Close asChild>
              <Button variant="secondary" size="sm">
                סגירה
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type FormValues = {
  orderId: string;
  amount: string;
  paymentDate: string;
  externalInvoiceNumber: string;
};

/**
 * Today, in Jerusalem, as `yyyy-mm-dd`.
 *
 * Computed rather than taken from `new Date().toISOString()`: the browser may
 * be anywhere, and a default date the server would then refuse as "in the
 * future" is the form arguing with itself.
 */
function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

/** The "no single order" choice. Empty string, because that is what the server reads. */
const SPLIT = "";

function OrderPicker({
  orders,
  value,
  onChange,
  testId,
}: {
  orders: BillableOrder[];
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
    >
      {/* Rule 5, and the answer to "he paid several orders at once": one sum,
          split across what is open, oldest first. */}
      <option value={SPLIT}>תשלום כללי — יתחלק בין ההזמנות הפתוחות</option>
      {orders.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label} · נותר {MONEY.format(o.open)} · {PAYMENT_STATUS_LABELS[o.paymentStatus]}
        </option>
      ))}
    </select>
  );
}

function NewPaymentForm({
  customerId,
  orders,
  busy,
  onSubmit,
}: {
  customerId: string;
  orders: BillableOrder[];
  busy: boolean;
  onSubmit: (values: FormValues, reset: () => void) => void;
}) {
  // A general payment is the default: it is what happens when somebody hands
  // over a sum, and naming one order is the special case.
  const [orderId, setOrderId] = useState(SPLIT);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [invoice, setInvoice] = useState("");
  /**
   * The last preview the server returned, stamped with the input that produced
   * it.
   *
   * Stamped rather than cleared, and that is the whole trick: clearing it when
   * the amount changes would mean calling setState in the effect body — a
   * cascading render React warns about, and one ESLint refuses here. Keeping
   * the key means "is this preview about what is currently typed" is a
   * comparison at render time, so a stale sentence is never shown and no extra
   * render is needed to hide it.
   */
  const [preview, setPreview] = useState({ key: "", text: "" });

  const selected = orders.find((o) => o.id === orderId);
  const previewKey = orderId === SPLIT && amount.trim() ? `${orderId}|${amount}` : "";
  const previewText = previewKey && preview.key === previewKey ? preview.text : "";

  /**
   * The split, described before it happens.
   *
   * Debounced, and asked of the SERVER rather than computed here: the open
   * balances this page was rendered with may already be stale, and a preview
   * that disagrees with what the save does is worse than no preview.
   *
   * The dependency is the KEY — a string — and never the `orders` array, which
   * is rebuilt on every render and would make the effect run forever and wipe
   * the field mid-typing (CLAUDE.md).
   */
  useEffect(() => {
    if (!previewKey) return;
    let live = true;
    const timer = setTimeout(async () => {
      const { text } = await previewAllocationAction(customerId, previewKey.split("|")[1]!);
      if (live) setPreview({ key: previewKey, text });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [customerId, previewKey]);

  const reset = () => {
    setAmount("");
    setInvoice("");
  };

  return (
    <form
      data-testid="record-payment-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ orderId, amount, paymentDate, externalInvoiceNumber: invoice }, reset);
      }}
      className="rounded-lg border border-outline-variant bg-surface-container-low p-4"
    >
      <h4 className="mb-3 text-sm font-semibold">רישום תשלום</h4>
      {/* Two columns and not four. Four fitted the old expanded row, where the
          form borrowed the table's full width; in a window it left a dead
          half-row beside the invoice field. Two reads straight down in the
          order the fields are filled. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="payment-order">
            שיוך
          </label>
          <OrderPicker
            orders={orders}
            value={orderId}
            onChange={setOrderId}
            testId="payment-order"
          />
          {selected ? (
            <p className="mt-1 text-xs text-on-surface-variant" data-testid="payment-open-amount">
              נותר לתשלום: <Ltr>{MONEY.format(selected.open)}</Ltr>
            </p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="payment-amount">
            סכום ששולם
          </label>
          <Input
            id="payment-amount"
            data-testid="payment-amount"
            dir="ltr"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="payment-date">
            תאריך תשלום
          </label>
          <Input
            id="payment-date"
            data-testid="payment-date"
            type="date"
            dir="ltr"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="payment-invoice">
            מספר חשבונית
          </label>
          <Input
            id="payment-invoice"
            data-testid="payment-invoice"
            dir="ltr"
            className="font-mono"
            value={invoice}
            onChange={(e) => setInvoice(e.target.value)}
            placeholder="INV-2026-081"
          />
          {/* FR-7 is explicit: the invoice is produced elsewhere and only its
              number is recorded here. Saying so stops anyone waiting for a PDF. */}
          <p className="mt-1 text-xs text-on-surface-variant">
            מספר מהחשבונית שהופקה במערכת החשבונות — המערכת אינה מפיקה חשבוניות.
          </p>
        </div>
      </div>

      {/* Fixed height with the text absolutely inside it: a two-line split
          description must not push the save button out from under the cursor
          mid-click (CLAUDE.md — anything that opens above a thing you click). */}
      <div className="relative mt-3 h-10">
        {previewText ? (
          <p
            className="absolute inset-0 overflow-y-auto rounded-sm bg-status-info-bg px-3 py-2 text-xs text-status-info-fg"
            data-testid="allocation-preview"
          >
            {previewText}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={busy} data-testid="save-payment">
          <Check className="size-4" />
          {busy ? "שומר…" : "שמירת תשלום"}
        </Button>
      </div>
    </form>
  );
}

function EditPaymentForm({
  payment,
  orders,
  busy,
  onSubmit,
  onCancel,
}: {
  payment: PaymentRow;
  orders: BillableOrder[];
  busy: boolean;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
}) {
  const [orderId, setOrderId] = useState(payment.orderId ?? SPLIT);
  const [amount, setAmount] = useState(String(payment.amount));
  const [paymentDate, setPaymentDate] = useState(payment.paymentDate);
  const [invoice, setInvoice] = useState(payment.invoiceNumber);

  return (
    <div className="grid gap-3 rounded-sm border border-primary/40 bg-surface-container-low p-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <label className="mb-1 block text-xs text-on-surface-variant">שיוך</label>
        <OrderPicker
          orders={orders}
          value={orderId}
          onChange={setOrderId}
          testId={`edit-order-${payment.id}`}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">סכום</label>
        <Input
          dir="ltr"
          inputMode="decimal"
          data-testid={`edit-amount-${payment.id}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">תאריך</label>
        <Input
          type="date"
          dir="ltr"
          data-testid={`edit-date-${payment.id}`}
          value={paymentDate}
          onChange={(e) => setPaymentDate(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-on-surface-variant">חשבונית</label>
        <Input
          dir="ltr"
          className="font-mono"
          data-testid={`edit-invoice-${payment.id}`}
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
        />
      </div>
      <div className="flex items-end gap-2 lg:col-span-5">
        <Button
          size="sm"
          disabled={busy}
          data-testid={`save-edit-${payment.id}`}
          onClick={() => onSubmit({ orderId, amount, paymentDate, externalInvoiceNumber: invoice })}
        >
          שמירה
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          ביטול
        </Button>
        <span className="ms-auto text-xs text-on-surface-variant">
          {payment.groupId
            ? "השורה הזאת היא חלק מתשלום מפוצל — עריכה נוגעת בה בלבד"
            : "עריכה נרשמת ביומן עם הערך הקודם"}
        </span>
      </div>
    </div>
  );
}
