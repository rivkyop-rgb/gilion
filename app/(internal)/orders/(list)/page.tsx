import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { countOrdersByStatus, listOrders, pendingPortalRequests } from "@/lib/data/orders";
import { Send } from "lucide-react";
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from "@/lib/domain/order-status";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { ORDER_TONE, TONE_ROW } from "@/components/status-tone";
import { cn } from "@/lib/utils";
import { OrderStatusBadge, SourceBadge, StatusChip } from "../order-badges";
import { formatDate, formatMoney, orderNumber } from "../format";

export const metadata: Metadata = { title: "הזמנות · Gilion" };

/* (list) route group so loading.tsx covers only this page — see 02-customers.md §סטיות. */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; source?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "orders");

  const { status = "all", source = "all" } = await searchParams;
  const mayEdit = canWriteArea(ctx, "orders");

  const [orders, counts, pendingFromPortal] = await Promise.all([
    listOrders(ctx.businessId, { status, source }),
    countOrdersByStatus(ctx.businessId),
    pendingPortalRequests(ctx.businessId),
  ]);
  const portalOnly = source === "customer_portal";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">הזמנות</h1>
          <p className="text-sm text-on-surface-variant">
            הזמנה בטיוטה אינה יוצרת פרסומים מחייבים. הפרסומים נוצרים רק באישור.
          </p>
        </div>
        {mayEdit ? (
          <Button asChild>
            <Link href="/orders/new" data-testid="new-order">
              <Plus className="size-4" />
              הזמנה חדשה
            </Link>
          </Button>
        ) : null}
      </div>

      {/* Backlog 27: what customers sent, found without reading every row. */}
      <div className="mb-3">
        <Link
          href={portalOnly ? "/orders" : "/orders?source=customer_portal&status=pending_approval"}
          data-testid="portal-filter"
          aria-current={portalOnly ? "page" : undefined}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
            portalOnly
              ? "bg-status-accent-fg text-on-primary"
              : "bg-status-accent-bg text-status-accent-fg hover:brightness-95",
          )}
        >
          <Send className="size-4" aria-hidden />
          בקשות מהפורטל שממתינות לאישור
          <span
            data-testid="portal-pending-count"
            className="rounded-full bg-surface-container-lowest px-2 text-status-accent-fg"
          >
            <Ltr>{pendingFromPortal}</Ltr>
          </span>
        </Link>
      </div>

      {/* The chip row doubles as the colour legend for the table below it. */}
      <div className="mb-4 flex flex-wrap gap-2" data-testid="status-filters">
        <Link href="/orders" aria-current={status === "all" ? "page" : undefined}>
          <span
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors",
              status === "all"
                ? "bg-primary text-on-primary"
                : "bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant hover:bg-surface-container",
            )}
          >
            הכל
          </span>
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/orders?status=${s}`}
            data-testid={`status-filter-${s}`}
            aria-current={status === s ? "page" : undefined}
          >
            <StatusChip
              tone={ORDER_TONE[s]}
              label={ORDER_STATUS_LABELS[s]}
              count={counts[s]}
              active={status === s}
            />
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title={status === "all" ? "עדיין אין הזמנות" : "אין הזמנות בסטטוס הזה"}
          body="הזמנה מרכזת כמה פרסומים ללקוח אחד. באישור שלה נוצרים הפרסומים המחייבים."
          action={
            mayEdit && status === "all" ? (
              <Button asChild>
                <Link href="/orders/new">הזמנה חדשה</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <table className="w-full text-sm" data-testid="orders-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">מספר</th>
                <th className="p-3 text-start font-semibold">לקוח</th>
                <th className="p-3 text-start font-semibold">מקור</th>
                <th className="p-3 text-start font-semibold">פרסומים</th>
                <th className="p-3 text-start font-semibold">סכום</th>
                <th className="p-3 text-start font-semibold">סטטוס</th>
                <th className="p-3 text-start font-semibold">נוצרה</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr
                  key={o.id}
                  data-testid={`order-row-${o.id}`}
                  data-source={o.source}
                  className={cn(
                    "border-t border-outline-variant",
                    TONE_ROW[ORDER_TONE[o.status as OrderStatus]] ||
                      "hover:bg-surface-container-low",
                  )}
                >
                  <td
                    className={cn(
                      "p-3",
                      // A bar at the row's start edge: the portal order is
                      // visible before anyone reads the source column.
                      o.source === "customer_portal" && "border-s-4 border-s-status-accent-fg",
                    )}
                  >
                    <Link href={`/orders/${o.id}`} className="font-mono text-xs underline">
                      <Ltr>{orderNumber(o.number)}</Ltr>
                    </Link>
                  </td>
                  <td className="p-3">{o.customer.business_name}</td>
                  <td className="p-3">
                    <SourceBadge source={o.source} />
                  </td>
                  <td className="p-3">
                    <Ltr>{o.status === "draft" ? o._count.items : o._count.publications}</Ltr>
                  </td>
                  <td className="p-3">
                    <Ltr>{formatMoney(Number(o.total_price))}</Ltr>
                  </td>
                  <td className="p-3">
                    <OrderStatusBadge status={o.status as OrderStatus} />
                  </td>
                  <td className="p-3">
                    <Ltr>{formatDate(o.created_at)}</Ltr>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
