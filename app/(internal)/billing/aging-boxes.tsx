"use client";

import { useState } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";

import { Ltr } from "@/components/ui/ltr";
import { formatMoney } from "@/lib/domain/format";
import { cn } from "@/lib/utils";

export type AgingBoxLine = {
  publicationId: string;
  orderId: string;
  orderLabel: string;
  newspaper: string;
  shape: string;
  date: string;
  open: number;
};

export type AgingBoxCustomer = {
  customerId: string;
  name: string;
  amount: number;
  items: AgingBoxLine[];
};

export type AgingBox = {
  key: string;
  label: string;
  amount: number;
  customers: number;
  breakdown: AgingBoxCustomer[];
};

const customersPhrase = (n: number) => (n === 0 ? "אין לקוחות" : n === 1 ? "לקוח אחד" : null);

/**
 * The four aging boxes, each one opening what it is made of (08/11/2026: "לא
 * אמורות להיות לחיצות — שאראה איזה לקוחות וממה מורכב הסכום?"). A sum that
 * cannot be opened is a number nobody acts on. The dialog lists the customers
 * in the bucket, largest first, and under each the publications that make up
 * their share — every line adds up to the box.
 */
export function AgingBoxes({
  buckets,
  customerHref,
}: {
  buckets: AgingBox[];
  /** Where a customer's name leads — their billing page. */
  customerHref: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {buckets.map((b, i) => (
        <AgingBoxButton key={b.key} bucket={b} tone={i} customerHref={customerHref} />
      ))}
    </div>
  );
}

function AgingBoxButton({
  bucket: b,
  tone,
  customerHref,
}: {
  bucket: AgingBox;
  tone: number;
  customerHref: string;
}) {
  const empty = b.amount <= 0;
  const box = (
    <>
      <span className="block text-xs text-on-surface-variant">{b.label}</span>
      <span className="mt-1 block text-lg font-semibold">
        <Ltr>{formatMoney(b.amount)}</Ltr>
      </span>
      <span className="block text-xs text-on-surface-variant">
        {customersPhrase(b.customers) ?? (
          <>
            <Ltr>{b.customers}</Ltr> לקוחות
          </>
        )}
        {empty ? null : <span className="text-primary underline"> · פירוט</span>}
      </span>
    </>
  );
  const className = cn(
    "rounded-lg border border-outline-variant bg-surface-container-lowest p-3 text-start",
    !empty && tone >= 2 && "border-status-error-fg/40 bg-status-error-bg/30",
    !empty && tone === 1 && "border-status-warning-fg/40 bg-status-warning-bg/30",
  );

  // An empty bucket has nothing to open — a button that opens "nothing" is a
  // promise the screen does not keep.
  if (empty) {
    return (
      <div data-testid={`aging-${b.key}`} className={className}>
        {box}
      </div>
    );
  }

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          data-testid={`aging-${b.key}`}
          className={cn(
            className,
            "cursor-pointer transition hover:shadow-elevation-1 hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-primary",
          )}
        >
          {box}
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-primary/40" />
        <DialogPrimitive.Content
          data-testid={`aging-detail-${b.key}`}
          className="fixed inset-x-0 top-1/2 z-[71] mx-auto max-h-[85dvh] w-[min(48rem,calc(100vw-2rem))] -translate-y-1/2 overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-elevation-2"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="font-serif text-xl font-semibold">
                חוב {b.label}: <Ltr>{formatMoney(b.amount)}</Ltr>
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-on-surface-variant">
                פרסומים שכבר יצאו לדפוס ולא שולמו, לפי תאריך הפרסום. הגדול ביותר ראשון.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button type="button" aria-label="סגירה" className="rounded-sm p-1">
                <X className="size-5 text-on-surface-variant" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <ul className="flex flex-col gap-2">
            {b.breakdown.map((c) => (
              <CustomerLines key={c.customerId} customer={c} customerHref={customerHref} />
            ))}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CustomerLines({
  customer: c,
  customerHref,
}: {
  customer: AgingBoxCustomer;
  customerHref: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li
      className="rounded-lg border border-outline-variant"
      data-testid={`aging-customer-${c.customerId}`}
    >
      <div className="flex flex-wrap items-center gap-3 p-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-start"
          data-testid={`aging-customer-toggle-${c.customerId}`}
        >
          <ChevronDown
            className={cn("size-4 shrink-0 transition", open ? "" : "rotate-90")}
            aria-hidden
          />
          <span className="font-semibold">{c.name || "לקוח"}</span>
          <span className="text-xs text-on-surface-variant">
            {c.items.length === 1 ? (
              "פרסום אחד"
            ) : (
              <>
                <Ltr>{c.items.length}</Ltr> פרסומים
              </>
            )}
          </span>
        </button>
        <span className="font-semibold">
          <Ltr>{formatMoney(c.amount)}</Ltr>
        </span>
        <Link
          href={`${customerHref}/${c.customerId}`}
          className="whitespace-nowrap rounded-lg border border-primary px-3 py-1 text-sm text-primary hover:bg-primary/5"
          data-testid={`aging-go-${c.customerId}`}
        >
          לגבייה
        </Link>
      </div>
      {open ? (
        <table className="w-full border-t border-outline-variant text-sm">
          <thead className="bg-surface-container-low text-xs text-on-surface-variant">
            <tr>
              <th className="p-2 text-start font-medium">תאריך</th>
              <th className="p-2 text-start font-medium">עיתון</th>
              <th className="p-2 text-start font-medium">גודל</th>
              <th className="p-2 text-start font-medium">הזמנה</th>
              <th className="p-2 text-end font-medium">פתוח</th>
            </tr>
          </thead>
          <tbody>
            {c.items.map((line) => (
              <tr key={line.publicationId} className="border-t border-outline-variant">
                <td className="p-2">
                  <Ltr>{line.date}</Ltr>
                </td>
                <td className="p-2">{line.newspaper}</td>
                <td className="p-2">{line.shape}</td>
                <td className="p-2">
                  <Link href={`/orders/${line.orderId}`} className="font-mono text-xs underline">
                    <Ltr>{line.orderLabel}</Ltr>
                  </Link>
                </td>
                <td className="whitespace-nowrap p-2 text-end">
                  <Ltr>{formatMoney(line.open)}</Ltr>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </li>
  );
}
