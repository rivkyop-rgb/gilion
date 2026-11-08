"use client";

import { Fragment, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import type { MonthRow } from "@/lib/domain/payment-months";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/domain/format";

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
export function MonthTable({
  customerId,
  months,
  collapseSettled = true,
}: {
  customerId: string;
  months: MonthRow[];
  /**
   * Hide fully-paid months behind a count.
   *
   * Right in the billing window, where the question is what to collect. WRONG
   * on a customer card whose month list is PAGED: the pager counts the rows it
   * was given and this would then hide some of them, so the range label would
   * promise ten rows and the table would show two. Two filters over one list
   * have to be the same filter.
   */
  collapseSettled?: boolean;
}) {
  const [showSettled, setShowSettled] = useState(false);
  const open = collapseSettled ? months.filter((m) => m.open > 0) : months;
  const settled = collapseSettled ? months.length - open.length : 0;
  const shown = showSettled || !collapseSettled ? months : open.length > 0 ? open : months;

  const [expanded, setExpanded] = useState<string | null>(null);
  // The bottom line, over every month — not only the ones shown — so it is the
  // same three numbers as the head of the page (08/11/2026: a table of ₪640
  // under a total of ₪800 read as an error).
  const total = months.reduce(
    (t, m) => ({ billed: t.billed + m.billed, paid: t.paid + m.paid, open: t.open + m.open }),
    { billed: 0, paid: 0, open: 0 },
  );
  const count = months.reduce((n, m) => n + m.publicationCount, 0);

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
          {shown.map((m) => {
            const isOpen = expanded === m.key;
            const canOpen = (m.publications?.length ?? 0) > 0;
            return (
              <Fragment key={m.key}>
                <tr
                  data-testid={`month-row-${m.key}`}
                  className={cn(
                    "border-t border-outline-variant",
                    m.open > 0 ? "" : "text-on-surface-variant",
                  )}
                >
                  <td className="p-2 font-medium">
                    {canOpen ? (
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : m.key)}
                        aria-expanded={isOpen}
                        data-testid={`month-expand-${m.key}`}
                        className="inline-flex items-center gap-1 text-start hover:underline"
                        title="אילו פרסומים בחודש הזה"
                      >
                        <ChevronDown
                          className={cn("size-4 shrink-0 transition", isOpen ? "" : "rotate-90")}
                          aria-hidden
                        />
                        {m.label}
                      </button>
                    ) : (
                      m.label
                    )}
                    {m.open <= 0 ? (
                      <span className="ms-2 text-xs font-normal text-status-success-fg">שולם</span>
                    ) : null}
                  </td>
                  <td className="p-2">
                    <Ltr>{formatMoney(m.billed)}</Ltr>
                  </td>
                  <td className="p-2 text-status-success-fg">
                    <Ltr data-testid={`month-paid-${m.key}`}>{formatMoney(m.paid)}</Ltr>
                  </td>
                  <td className="p-2 font-semibold">
                    <Ltr data-testid={`month-open-${m.key}`}>{formatMoney(m.open)}</Ltr>
                  </td>
                  <td className="p-2 text-xs text-on-surface-variant">
                    <Ltr>{m.publicationCount}</Ltr>
                  </td>
                </tr>
                {isOpen
                  ? m.publications!.map((p) => (
                      <tr
                        key={p.id}
                        data-testid={`month-publication-${p.id}`}
                        className="bg-surface-container-low text-xs"
                      >
                        <td className="py-1.5 ps-8 pe-2">
                          <Ltr>{shortDate(p.date)}</Ltr>
                          <span className="ms-2 text-on-surface-variant">
                            {p.ran ? "פורסם" : "עוד לא פורסם"}
                          </span>
                        </td>
                        <td className="px-2 py-1.5">
                          <Ltr>{formatMoney(p.price)}</Ltr>
                        </td>
                        <td className="px-2 py-1.5 text-status-success-fg">
                          <Ltr>{formatMoney(p.paid)}</Ltr>
                        </td>
                        <td className="px-2 py-1.5 font-semibold">
                          {p.open <= 0 ? (
                            <span className="font-normal text-status-success-fg">שולם במלואו</span>
                          ) : (
                            <Ltr>{formatMoney(p.open)}</Ltr>
                          )}
                        </td>
                        <td />
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
        </tbody>
        {months.length > 1 ? (
          <tfoot>
            <tr
              className="border-t-2 border-outline font-semibold"
              data-testid={`month-total-${customerId}`}
            >
              <td className="p-2">סה״כ</td>
              <td className="p-2">
                <Ltr>{formatMoney(round2(total.billed))}</Ltr>
              </td>
              <td className="p-2 text-status-success-fg">
                <Ltr>{formatMoney(round2(total.paid))}</Ltr>
              </td>
              <td className="p-2">
                <Ltr>{formatMoney(round2(total.open))}</Ltr>
              </td>
              <td className="p-2 text-xs font-normal text-on-surface-variant">
                <Ltr>{count}</Ltr>
              </td>
            </tr>
          </tfoot>
        ) : null}
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

const round2 = (n: number) => Math.round(n * 100) / 100;

/** `2026-11-12` → `12.11.2026`, the way every date in the product reads. */
function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.${y}`;
}
