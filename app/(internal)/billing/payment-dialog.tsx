"use client";

import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { Ltr } from "@/components/ui/ltr";
import {
  PaymentEditor,
  type BillableOrder,
  type HistoryEntry,
  type PaymentRow,
} from "./payment-editor";
import type { MonthRow } from "@/lib/domain/payment-months";

const MONEY = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });

/**
 * Recording a payment, in a window of its own.
 *
 * It used to be an expanded table row: a form, three tables and a money summary
 * squeezed into one `<td colSpan={8}>`, sharing its column widths with the list
 * behind it and shoving every row below it down the page. Typing amounts in
 * there is exactly as awkward as it sounds, and the user said so.
 *
 * OPENED BY THE URL, not by local state. `?customer=X` is what puts it on
 * screen, which is what makes it survive a reload, a `router.refresh()` after a
 * save, and a link from the customer card — and what lets a Playwright spec
 * navigate straight to it instead of hunting for a row to click.
 */
export function PaymentDialog({
  customerId,
  customerLabel,
  outstanding,
  credit,
  closeHref,
  ...editor
}: {
  customerId: string;
  customerLabel: string;
  outstanding: number;
  credit: number;
  /** The list URL with this customer dropped — where closing goes. */
  closeHref: string;
  orders: BillableOrder[];
  months: MonthRow[];
  payments: PaymentRow[];
  history: HistoryEntry[];
  historyMonths: number;
  mayWrite: boolean;
}) {
  const router = useRouter();

  // `replace` and not `push`: closing a dialog is not a step somebody thinks
  // they took, so "back" should leave billing rather than reopen the window
  // they just shut. It also keeps the entry they arrived from — the customer
  // card links straight here — reachable in one press.
  const close = () => router.replace(closeHref, { scroll: false });

  return (
    <DialogPrimitive.Root open onOpenChange={(next) => (next ? undefined : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-primary/40" />
        <DialogPrimitive.Content
          data-testid={`billing-open-${customerId}`}
          // Centred with inset-x-0 + mx-auto rather than a translate, so it
          // lands in the middle in both directions with no RTL special case and
          // no `left-`/`right-` utility, which the lint bans (confirm-dialog).
          className="fixed inset-x-0 top-1/2 z-50 mx-auto flex max-h-[88dvh] w-[min(56rem,calc(100vw-2rem))] -translate-y-1/2 flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-2"
        >
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant p-5">
            <div>
              <DialogPrimitive.Title className="font-serif text-xl font-semibold">
                {customerLabel}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-on-surface-variant">
                {outstanding > 0 ? (
                  <>
                    נותר לתשלום <Ltr className="font-semibold">{MONEY.format(outstanding)}</Ltr>
                  </>
                ) : credit > 0 ? (
                  <>
                    אין חוב פתוח · <Ltr>{MONEY.format(credit)}</Ltr> לזכות הלקוח
                  </>
                ) : (
                  "אין חוב פתוח"
                )}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              data-testid="close-payment-dialog"
              className="rounded-sm p-1 text-on-surface-variant hover:bg-surface-container"
            >
              <X className="size-5" />
              <span className="sr-only">סגירה</span>
            </DialogPrimitive.Close>
          </div>

          {/* The body scrolls, the header does not: the name and the balance are
              what the window is about, and they must not scroll away while
              somebody is reading the months under them. */}
          <div className="overflow-y-auto p-5">
            <PaymentEditor
              customerId={customerId}
              outstanding={outstanding}
              credit={credit}
              {...editor}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
