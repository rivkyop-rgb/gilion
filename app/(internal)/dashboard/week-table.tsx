import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { PAYMENT_TONE } from "@/components/status-tone";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/payment-status";
import { type PublicationStatus } from "@/lib/domain/publication-status";
import { ATTENTION_LABELS, attentionReason } from "@/lib/domain/dashboard";
import { cn } from "@/lib/utils";
import { PublicationStatusBadge, SourceBadge } from "../orders/order-badges";
import { formatDate, orderNumber } from "../orders/format";

export type WeekRow = {
  id: string;
  customerId: string;
  customerName: string;
  newspaperName: string;
  date: Date;
  shapeName: string;
  source: "internal" | "customer_portal";
  status: PublicationStatus;
  placementStatus: string;
  hasAdvertisement: boolean;
  orderId: string;
  orderNumber: number;
  /** Absent for a designer — never fetched, not merely not rendered (FR-8). */
  paymentStatus: PaymentStatus | null;
  /** The board this row belongs to, when one has been opened for its date. */
  issueId: string | null;
};

/**
 * The nine columns of US-001 AC-3.
 *
 * Deliberately a different component from the one on `/publications`, and the
 * duplication is only in the markup: both read `listPublications`, so the two
 * screens cannot disagree about which rows exist or what state they are in.
 * What differs is what each is FOR — that one is a workbench with inline
 * artwork linking and cancellation, this one is a read: a publisher checking
 * the week, who should reach the row's own screen to act rather than act here.
 */
export function WeekTable({ rows, showsMoney }: { rows: WeekRow[]; showsMoney: boolean }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="אין פרסומים בטווח הזה"
        body="פרסומים נוצרים כשהזמנה מאושרת. אפשר להרחיב את טווח התאריכים למעלה כדי לראות תאריכים אחרים."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
      <table className="w-full text-sm" data-testid="week-table">
        <thead className="bg-surface-container">
          <tr>
            <th className="p-3 text-start font-semibold" data-testid="col-customer">
              לקוח
            </th>
            <th className="p-3 text-start font-semibold" data-testid="col-newspaper">
              עיתון
            </th>
            <th className="p-3 text-start font-semibold" data-testid="col-date">
              תאריך
            </th>
            <th className="p-3 text-start font-semibold" data-testid="col-size">
              גודל
            </th>
            <th className="p-3 text-start font-semibold" data-testid="col-source">
              מקור פרסום
            </th>
            <th className="p-3 text-start font-semibold" data-testid="col-status">
              סטטוס פרסום
            </th>
            <th className="p-3 text-start font-semibold" data-testid="col-placement">
              סטטוס שיבוץ
            </th>
            <th className="p-3 text-start font-semibold" data-testid="col-ad">
              סטטוס מודעה
            </th>
            {/* Absent for a designer, and so is the data behind it (FR-8). */}
            {showsMoney ? (
              <th className="p-3 text-start font-semibold" data-testid="col-payment">
                סטטוס תשלום
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const attention = attentionReason({
              status: row.status,
              placementStatus: row.placementStatus,
              hasAdvertisement: row.hasAdvertisement,
            });
            return (
              <tr
                key={row.id}
                data-testid={`week-row-${row.id}`}
                data-attention={attention ?? "none"}
                className={cn(
                  "border-t border-outline-variant",
                  // US-001 AC-5. The tint says "this one needs somebody"; the
                  // badge in the relevant column says which somebody.
                  attention ? "bg-status-error-bg/30" : "hover:bg-surface-container-low",
                )}
              >
                <td className="p-3">
                  <Link
                    href={`/customers/${row.customerId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {row.customerName}
                  </Link>
                </td>
                <td className="p-3">{row.newspaperName}</td>
                <td className="p-3">
                  <Ltr>{formatDate(row.date)}</Ltr>
                </td>
                <td className="p-3 whitespace-nowrap">{row.shapeName}</td>
                <td className="p-3">
                  <SourceBadge source={row.source} />
                </td>
                <td className="p-3">
                  <PublicationStatusBadge status={row.status} />
                </td>
                <td className="p-3">
                  {row.issueId ? (
                    <Link
                      href={`/issues/${row.issueId}/board`}
                      data-testid={`week-board-${row.id}`}
                      className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                    >
                      <PlacementBadge placed={row.placementStatus === "placed"} />
                      <span className="text-xs text-on-surface-variant">ללוח</span>
                    </Link>
                  ) : (
                    <PlacementBadge placed={row.placementStatus === "placed"} />
                  )}
                </td>
                <td className="p-3">
                  <Badge tone={row.hasAdvertisement ? "success" : "error"}>
                    {row.hasAdvertisement ? "התקבלה" : ATTENTION_LABELS.missing_ad}
                  </Badge>
                </td>
                {showsMoney ? (
                  <td className="p-3">
                    <span className="flex flex-wrap items-center gap-2">
                      {row.paymentStatus ? (
                        <Badge
                          tone={PAYMENT_TONE[row.paymentStatus]}
                          data-status={row.paymentStatus}
                        >
                          {PAYMENT_STATUS_LABELS[row.paymentStatus]}
                        </Badge>
                      ) : null}
                      <Link
                        href={`/orders/${row.orderId}`}
                        className="font-mono text-xs underline-offset-2 hover:underline"
                      >
                        <Ltr>{orderNumber(row.orderNumber)}</Ltr>
                      </Link>
                    </span>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlacementBadge({ placed }: { placed: boolean }) {
  return (
    <Badge tone={placed ? "success" : "neutral"}>
      {placed ? "שובץ" : ATTENTION_LABELS.not_placed}
    </Badge>
  );
}
