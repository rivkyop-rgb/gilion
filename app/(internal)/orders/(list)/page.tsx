import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { getTenantContext } from "@/lib/auth/tenant";
import { canWrite, requireAccess } from "@/lib/auth/rbac";
import { countOrdersByStatus, listOrders } from "@/lib/data/orders";
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from "@/lib/domain/order-status";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { OrderStatusBadge, SourceBadge } from "../order-badges";
import { formatDate, formatMoney, orderNumber } from "../format";

export const metadata: Metadata = { title: "הזמנות · Gilion" };

/* (list) route group so loading.tsx covers only this page — see 02-customers.md §סטיות. */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "orders");

  const { status = "all" } = await searchParams;
  const mayEdit = canWrite(ctx.role, "orders");

  const [orders, counts] = await Promise.all([
    listOrders(ctx.businessId, { status }),
    countOrdersByStatus(ctx.businessId),
  ]);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 font-serif text-3xl font-semibold">הזמנות</h1>
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

      <div className="mb-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant={status === "all" ? "primary" : "secondary"}>
          <Link href="/orders">הכל</Link>
        </Button>
        {ORDER_STATUSES.map((s) => (
          <Button key={s} asChild size="sm" variant={status === s ? "primary" : "secondary"}>
            <Link href={`/orders?status=${s}`}>
              {ORDER_STATUS_LABELS[s]}
              {counts[s] ? ` (${counts[s]})` : ""}
            </Link>
          </Button>
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
        <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
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
                  className={
                    o.status === "pending_approval"
                      ? "border-t border-outline-variant bg-status-warning-bg/40"
                      : "border-t border-outline-variant hover:bg-surface-container-low"
                  }
                >
                  <td className="p-3">
                    <Link href={`/orders/${o.id}`} className="font-mono text-xs underline">
                      <Ltr>{orderNumber(o.id)}</Ltr>
                    </Link>
                  </td>
                  <td className="p-3">{o.customer.business_name ?? o.customer.contact_name}</td>
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
