import { Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ORDER_TONE,
  PUBLICATION_TONE,
  TONE_DOT,
  TONE_SOLID,
  type Tone,
} from "@/components/status-tone";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/domain/order-status";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { cn } from "@/lib/utils";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={ORDER_TONE[status]} data-testid="order-status" data-status={status}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PublicationStatusBadge({ status }: { status: PublicationStatus }) {
  return (
    <Badge tone={PUBLICATION_TONE[status]} data-status={status}>
      {PUBLICATION_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * Where an order came from — internal desk or the customer portal (US-001).
 *
 * A portal order is the one thing on this list nobody in the office typed, so
 * it does not get a quiet grey pill next to the others (backlog 27): it says
 * who sent it, in a colour of its own.
 */
export function SourceBadge({ source }: { source: "internal" | "customer_portal" }) {
  if (source !== "customer_portal") return <Badge tone="neutral">פנימי</Badge>;
  return (
    <Badge tone="accent" data-testid="source-portal" className="font-semibold">
      <Send className="size-3" aria-hidden />
      הלקוח שלח מהפורטל
    </Badge>
  );
}

/**
 * A status filter chip, in the status's own colour.
 *
 * Selected fills with the tone; unselected carries the same colour as a dot.
 * That way the row of chips reads as the legend for the table below it — the
 * colour is learned once, at the top, instead of per row.
 */
export function StatusChip({
  tone,
  label,
  count,
  active,
}: {
  tone: Tone;
  label: string;
  count?: number;
  active: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors",
        active
          ? cn(TONE_SOLID[tone], "ring-2 ring-primary ring-offset-1 ring-offset-background")
          : "bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant hover:bg-surface-container",
      )}
    >
      {!active ? <span className={cn("size-2 rounded-full", TONE_DOT[tone])} aria-hidden /> : null}
      {label}
      {/* `count !== undefined`, not `count` — a chip that shows nothing at zero
          reads as "unknown" beside chips that show numbers, and zero is an
          answer. On the publication report "מי חייב כסף · 0" is often the
          answer somebody came for, and it should not require a click. */}
      {count !== undefined ? <span className="ltr-isolate text-xs opacity-70">{count}</span> : null}
    </span>
  );
}
