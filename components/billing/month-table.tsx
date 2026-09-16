"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import type { MonthRow } from "@/lib/domain/payment-months";
import { cn } from "@/lib/utils";

const MONEY = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });

/**
 * The months, and what is still open on each.
 *
 * This is the table the panel leads with, because it is the shape the question
 * has: nobody rings a customer about `ORD-3K1VBH`, they ring them about March.
 *
 * Settled months collapse behind a count. A customer of two years has
 * twenty-four rows here and twenty of them say "0.00" — and a panel that opens
 * onto twenty rows of nothing buries the two that matter.
 */
export function MonthTable({ customerId, months }: { customerId: string; months: MonthRow[] }) {
  const [showSettled, setShowSettled] = useState(false);
  const open = months.filter((m) => m.open > 0);
  const settled = months.length - open.length;
  const shown = showSettled ? months : open.length > 0 ? open : months;

  return (
    <>
      <table className="w-full text-sm" data-testid={`month-balances-${customerId}`}>
        <thead>
          <tr className="text-xs text-on-surface-variant">
            <th className="p-2 text-start font-medium">חודש</th>
            <th className="p-2 text-start font-medium">לחיוב</th>
            <th className="p-2 text-start font-medium">שולם</th>
            <th className="p-2 text-start font-medium">נותר</th>
            <th className="p-2 text-start font-medium">פרסומים</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((m) => (
            <tr
              key={m.key}
              data-testid={`month-row-${m.key}`}
              className={cn(
                "border-t border-outline-variant",
                m.open > 0 ? "" : "text-on-surface-variant",
              )}
            >
              <td className="p-2 font-medium">{m.label}</td>
              <td className="p-2">
                <Ltr>{MONEY.format(m.billed)}</Ltr>
              </td>
              {/* The number the status alone could never give: partly paid HOW
                  MUCH, on which month. */}
              <td className="p-2 text-status-success-fg">
                <Ltr data-testid={`month-paid-${m.key}`}>{MONEY.format(m.paid)}</Ltr>
              </td>
              <td className="p-2 font-semibold">
                <Ltr data-testid={`month-open-${m.key}`}>{MONEY.format(m.open)}</Ltr>
              </td>
              <td className="p-2 text-xs text-on-surface-variant">
                <Ltr>{m.publicationCount}</Ltr>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {settled > 0 && open.length > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1"
          data-testid="toggle-settled-months"
          onClick={() => setShowSettled((v) => !v)}
        >
          {showSettled
            ? "רק חודשים פתוחים"
            : `הצגת ${settled === 1 ? "חודש ששולם" : `${settled} חודשים ששולמו`}`}
        </Button>
      ) : null}
    </>
  );
}
