import { Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ui/ltr";
import { ShapePreview } from "@/app/(internal)/settings/shape-preview";
import { PORTAL_STATUS, rejectionReasonToShow, requestPrice } from "@/lib/domain/portal-request";
import type { OrderStatus } from "@/lib/domain/order-status";

const DATE = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Jerusalem",
});
/** Publication dates are calendar dates stored at UTC midnight — no zone shift. */
const DAY = new Intl.DateTimeFormat("he-IL", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

export const formatPortalDate = (d: Date) => DATE.format(d);
export const formatPublicationDay = (d: Date) => DAY.format(d);
const SHORT_DAY = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
/** A publication date without its weekday, for ranges and lists. */
export const formatPortalDay = (d: Date) => SHORT_DAY.format(d);

/** The request's reference, the same ORD-0042 staff will quote on the phone. */
/** A portal request is an order, and is called by the same number. */
export { orderNumber as requestNumber } from "@/lib/domain/format";

export function PortalStatusBadge({ status }: { status: OrderStatus }) {
  const s = PORTAL_STATUS[status];
  return (
    <Badge tone={s.tone} data-testid="portal-status" data-status={status}>
      {s.label}
    </Badge>
  );
}

/** FR-19 — present when a reason was given, absent (not empty) when not. */
export function RejectionReason({ status, reason }: { status: string; reason: string | null }) {
  const text = rejectionReasonToShow(status, reason);
  if (!text) return null;
  return (
    <div
      data-testid="rejection-reason"
      className="flex items-start gap-2 rounded-lg bg-status-error-bg px-4 py-3 text-sm text-status-error-fg"
    >
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">סיבת הדחייה: </span>
        {text}
      </p>
    </div>
  );
}

export function ShapeLabel({
  shape,
  grid,
}: {
  shape: { name: string; cols: number; rows: number };
  grid: { columns: number; rows: number } | null;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {grid ? (
        <ShapePreview cols={shape.cols} rows={shape.rows} grid={grid} className="h-8 w-6" />
      ) : null}
      <span>{shape.name}</span>
    </span>
  );
}

export { Ltr };

const MONEY = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 2,
});
export const formatPortalMoney = (n: number) => MONEY.format(n);

/**
 * The price of a request, said honestly (backlog 23): "estimated" until the
 * newspaper approves it, the charged amount after, nothing when it was turned
 * down or withdrawn.
 */
export function RequestPrice({
  order,
}: {
  order: {
    status: string;
    total_price: unknown;
    publications: Array<{ price: unknown; status: string }>;
  };
}) {
  const price = requestPrice({
    status: order.status,
    total_price: Number(order.total_price),
    publications: order.publications.map((p) => ({ price: Number(p.price), status: p.status })),
  });
  if (!price) return null;
  return (
    <span data-testid="request-price" data-estimate={price.estimate || undefined}>
      {price.estimate ? "מחיר משוער: " : "מחיר: "}
      <Ltr className="font-semibold">{formatPortalMoney(price.amount)}</Ltr>
    </span>
  );
}
