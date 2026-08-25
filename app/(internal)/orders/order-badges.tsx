import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/domain/order-status";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";

const ORDER_TONE: Record<OrderStatus, "success" | "warning" | "error" | "debt" | "neutral"> = {
  draft: "neutral",
  pending_approval: "warning",
  approved: "success",
  rejected: "error",
  canceled: "neutral",
  completed: "success",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={ORDER_TONE[status]} data-testid="order-status">
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

const PUBLICATION_TONE: Record<
  PublicationStatus,
  "success" | "warning" | "error" | "debt" | "neutral"
> = {
  planned: "neutral",
  missing_ad: "error",
  ad_received: "warning",
  ready_for_layout: "warning",
  placed: "success",
  published: "success",
  canceled: "neutral",
  billed: "success",
};

export function PublicationStatusBadge({ status }: { status: PublicationStatus }) {
  return <Badge tone={PUBLICATION_TONE[status]}>{PUBLICATION_STATUS_LABELS[status]}</Badge>;
}

/** Where an order came from — internal desk or the customer portal (US-001). */
export function SourceBadge({ source }: { source: "internal" | "customer_portal" }) {
  return (
    <Badge tone={source === "customer_portal" ? "debt" : "neutral"}>
      {source === "customer_portal" ? "פורטל לקוח" : "פנימי"}
    </Badge>
  );
}
