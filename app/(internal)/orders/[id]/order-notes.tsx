"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, StickyNote, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ltr } from "@/components/ui/ltr";
import { InlineError } from "@/components/states";
import { formatMoney } from "@/lib/domain/format";
import { WALK_IN_NOTES_MAX } from "@/lib/domain/walk-in";
import { recordPaymentAction } from "../../billing/actions";
import { updateOrderNotesAction } from "../actions";

/**
 * The order's notes, and — on a walk-in order — the payment that has to come
 * before approval (08/11/2026). Both on the order page itself: the person is
 * at the counter, and sending the clerk to the billing tab and back to approve
 * is how an order gets approved unpaid.
 */
export function OrderNotes({
  orderId,
  customerId,
  notes,
  mayEdit,
  walkIn,
}: {
  orderId: string;
  customerId: string;
  notes: string;
  mayEdit: boolean;
  /** Set on a walk-in order that is not approved yet. */
  walkIn: { total: number; paid: number; mayPay: boolean } | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(notes);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  const left = walkIn ? Math.max(0, Math.round((walkIn.total - walkIn.paid) * 100) / 100) : 0;
  const [amount, setAmount] = useState(left ? String(left) : "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoice, setInvoice] = useState("");
  const [payError, setPayError] = useState<string | null>(null);

  const saveNotes = () =>
    start(async () => {
      const result = await updateOrderNotesAction(orderId, text);
      setMessage({ ok: Boolean(result.ok), text: result.message ?? "" });
      if (result.ok) router.refresh();
    });

  const pay = () =>
    start(async () => {
      setPayError(null);
      const result = await recordPaymentAction({
        customerId,
        orderId,
        amount,
        paymentDate: date,
        externalInvoiceNumber: invoice,
      });
      if (result.message) return setPayError(result.message);
      setInvoice("");
      router.refresh();
    });

  return (
    <section
      className="mb-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-5 shadow-elevation-1"
      data-testid="order-notes"
    >
      <h2 className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold">
        <StickyNote className="size-5" aria-hidden />
        הערות
        {walkIn ? (
          <span className="text-sm font-normal text-on-surface-variant">
            — לקוח כללי: כאן כותבים את שם הלקוח ואיך להשיג אותו
          </span>
        ) : null}
      </h2>
      {mayEdit ? (
        <>
          <textarea
            value={text}
            maxLength={WALK_IN_NOTES_MAX}
            rows={3}
            aria-label="הערות להזמנה"
            data-testid="order-notes-text"
            onChange={(e) => {
              setText(e.target.value);
              setMessage(null);
            }}
            className="w-full rounded-lg border border-outline-variant bg-surface-container p-3 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || text.trim() === notes.trim()}
              onClick={saveNotes}
              data-testid="save-order-notes"
            >
              שמירת ההערות
            </Button>
            {message ? (
              message.ok ? (
                <span className="text-sm text-status-success-fg" role="status">
                  {message.text}
                </span>
              ) : (
                <InlineError>{message.text}</InlineError>
              )
            ) : null}
          </div>
        </>
      ) : (
        <p className="whitespace-pre-wrap text-sm" data-testid="order-notes-read">
          {notes || "—"}
        </p>
      )}

      {walkIn ? (
        <div
          className="mt-4 rounded-lg border border-status-warning-fg/30 bg-status-warning-bg/40 p-4"
          data-testid="walk-in-payment"
        >
          <h3 className="mb-1 flex items-center gap-2 font-semibold">
            <Wallet className="size-4" aria-hidden />
            לקוח כללי משלם לפני האישור
          </h3>
          {walkIn.total <= 0 ? (
            <p className="text-sm text-on-surface-variant" data-testid="walk-in-no-lines">
              קודם מוסיפים את שורות הפרסום — הסכום לתשלום ייקבע לפיהן.
            </p>
          ) : left === 0 ? (
            <p
              className="flex items-center gap-2 text-sm text-status-success-fg"
              data-testid="walk-in-paid"
            >
              <CheckCircle2 className="size-4" aria-hidden />
              שולם <Ltr>{formatMoney(walkIn.paid)}</Ltr> — אפשר לאשר את ההזמנה.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm">
                לתשלום <Ltr>{formatMoney(walkIn.total)}</Ltr>
                {walkIn.paid > 0 ? (
                  <>
                    , שולמו <Ltr>{formatMoney(walkIn.paid)}</Ltr>, חסרים{" "}
                    <Ltr>{formatMoney(left)}</Ltr>
                  </>
                ) : null}
                . ההזמנה לא תאושר עד שהתשלום נרשם.
              </p>
              {walkIn.mayPay ? (
                <div className="grid items-end gap-3 sm:grid-cols-[8rem_10rem_minmax(0,1fr)_auto]">
                  <div>
                    <Label htmlFor="walk-in-amount">סכום</Label>
                    <Input
                      id="walk-in-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      data-testid="walk-in-amount"
                    />
                  </div>
                  <div>
                    <Label htmlFor="walk-in-date">תאריך</Label>
                    <Input
                      id="walk-in-date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="walk-in-invoice">מספר חשבונית / קבלה</Label>
                    <Input
                      id="walk-in-invoice"
                      value={invoice}
                      onChange={(e) => setInvoice(e.target.value)}
                      data-testid="walk-in-invoice"
                    />
                  </div>
                  <Button disabled={busy} onClick={pay} data-testid="walk-in-pay">
                    רישום התשלום
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">
                  רישום התשלום נעשה ע״י מי שיש לו הרשאה לגבייה.
                </p>
              )}
              {payError ? (
                <div className="mt-2">
                  <InlineError>{payError}</InlineError>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
