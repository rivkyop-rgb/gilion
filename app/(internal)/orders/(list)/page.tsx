import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { getCustomer } from "@/lib/data/customers";
import { countOrdersByStatus, listOrdersPage, pendingPortalRequests } from "@/lib/data/orders";
import { Send } from "lucide-react";
import { ORDER_STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from "@/lib/domain/order-status";
import { Button } from "@/components/ui/button";
import { DetailGrid, ExpandableRow } from "@/components/ui/expandable-row";
import { FilterBuilder } from "@/components/ui/filter-builder";
import { SavedFilters } from "@/components/ui/saved-filters";
import { listSavedFilters } from "@/lib/data/saved-filters";
import { normaliseFilterQuery } from "@/lib/domain/saved-filter";
import { ResetFilters } from "@/components/ui/reset-filters";
import { CustomerScopeBanner } from "@/components/customer-scope";
import { customerOptions } from "@/lib/data/customers";
import { listNewspapers, shapeOptions } from "@/lib/data/newspapers";
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_LABELS,
  type PaymentStatus,
} from "@/lib/domain/payment-status";
import { PAYMENT_TONE } from "@/components/status-tone";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ui/ltr";
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import { baseHrefFor, DEFAULT_PAGE_SIZE, parseListParams } from "@/lib/domain/list-view";
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
  searchParams: Promise<{
    status?: string;
    source?: string;
    customer?: string;
    newspaper?: string;
    shape?: string;
    payment?: string;
    from?: string;
    to?: string;
    page?: string;
    size?: string;
    q?: string;
  }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "orders");

  const params = await searchParams;
  const { status = "all", source = "all", customer = "all" } = params;
  const mayEdit = canWriteArea(ctx, "orders");
  // FR-8: whoever reads orders but not money does not filter by it either.
  const maySeeMoney = ctx.role !== "designer";

  const requested = parseListParams(params);
  // What "save as a button" would keep — the filters on screen, no paging.
  const currentQuery = normaliseFilterQuery(
    new URLSearchParams(
      Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"),
    ).toString(),
  );
  const saved = await listSavedFilters(ctx.businessId, ctx.userId, "orders");
  const [
    { rows: orders, total, list },
    counts,
    pendingFromPortal,
    customerRow,
    papers,
    shapes,
    customers,
  ] = await Promise.all([
    listOrdersPage(
      ctx.businessId,
      {
        status,
        source,
        customerId: customer,
        newspaperId: params.newspaper,
        shapeId: params.shape,
        payment: maySeeMoney ? params.payment : undefined,
        from: params.from,
        to: params.to,
      },
      requested,
    ),
    // The chips count what they would show — the same customer, if one is set.
    countOrdersByStatus(ctx.businessId, customer),
    pendingPortalRequests(ctx.businessId),
    customer !== "all" ? getCustomer(ctx.businessId, customer) : Promise.resolve(null),
    listNewspapers(ctx.businessId),
    shapeOptions(ctx.businessId),
    customerOptions(ctx.businessId),
  ]);
  // The filter bar's parameters. Every other link on the page (status chips,
  // "new order") carries them along — a chip that drops the customer the list
  // was opened for is a chip that quietly shows someone else's orders.
  const builderValues = {
    customer: customerRow ? customer : undefined,
    newspaper: params.newspaper,
    shape: params.shape,
    payment: maySeeMoney ? params.payment : undefined,
    source: params.source,
    from: params.from,
    to: params.to,
  };
  const withCustomer = (href: string) => {
    const url = new URL(href, "http://x");
    for (const [k, v] of Object.entries(builderValues)) {
      if (v && v !== "all" && !url.searchParams.has(k)) url.searchParams.set(k, v);
    }
    return `${url.pathname}${url.search}`;
  };
  const portalOnly = source === "customer_portal";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">
            {customerRow ? `הזמנות · ${customerRow.business_name}` : "הזמנות"}
          </h1>
          <p className="text-sm text-on-surface-variant">
            הזמנה בטיוטה אינה יוצרת פרסומים מחייבים. הפרסומים נוצרים רק באישור.
          </p>
        </div>
        {mayEdit ? (
          <Button asChild>
            <Link href={withCustomer("/orders/new")} data-testid="new-order">
              <Plus className="size-4" />
              הזמנה חדשה
            </Link>
          </Button>
        ) : null}
      </div>

      {customerRow ? (
        <CustomerScopeBanner
          testId="orders-customer-banner"
          customerId={customerRow.id}
          name={customerRow.business_name}
          what="ההזמנות"
          clearHref="/orders"
        />
      ) : null}

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
        <Link href={withCustomer("/orders")} aria-current={status === "all" ? "page" : undefined}>
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
            href={withCustomer(`/orders?status=${s}`)}
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

      <SavedFilters
        list="orders"
        basePath="/orders"
        currentQuery={currentQuery}
        filters={saved.map((f) => ({
          id: f.id,
          name: f.name,
          color: f.color,
          query: f.query,
          personal: f.owner_id !== null,
          removable:
            f.owner_id === ctx.userId ||
            f.created_by === ctx.userId ||
            ctx.role === "admin" ||
            ctx.isSuperAdmin,
        }))}
      />

      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <FilterBuilder
            basePath="/orders"
            // The list's own size and search survive a filter change; the
            // page does not, because the rows under it are different now.
            keep={{
              status,
              size: list.size !== DEFAULT_PAGE_SIZE ? String(list.size) : undefined,
              q: list.q || undefined,
            }}
            values={builderValues}
            fields={[
              {
                key: "newspaper",
                label: "עיתון",
                kind: "select",
                options: papers.map((n) => ({ value: n.id, label: n.name })),
              },
              {
                key: "customer",
                label: "לקוח",
                kind: "select",
                search: true,
                options: customers.map((c) => ({ value: c.id, label: c.business_name })),
              },
              { key: "shape", label: "גודל", kind: "select", options: shapes },
              ...(maySeeMoney
                ? [
                    {
                      key: "payment",
                      label: "תשלום",
                      kind: "select" as const,
                      options: PAYMENT_STATUSES.map((p) => ({
                        value: p,
                        label: PAYMENT_STATUS_LABELS[p],
                      })),
                    },
                  ]
                : []),
              {
                key: "source",
                label: "מקור",
                kind: "select",
                options: [
                  { value: "internal", label: "הוזן במשרד" },
                  { value: "customer_portal", label: "פורטל לקוח" },
                ],
              },
              { key: "from", label: "פרסום מתאריך", kind: "date" },
              { key: "to", label: "פרסום עד תאריך", kind: "date" },
            ]}
          />
        </div>
        <ResetFilters
          href="/orders"
          active={Object.entries(params).some(([, v]) => v && v !== "all")}
        />
      </div>

      <ListToolbar
        prefix=""
        params={list}
        total={total}
        baseHref={baseHrefFor("/orders", params)}
        searchLabel="מספר הזמנה או לקוח"
        exportHref={`/api/export/list/orders?${new URLSearchParams(
          Object.entries(params).filter(
            (e): e is [string, string] => typeof e[1] === "string" && e[1] !== "" && e[0] !== "page" && e[0] !== "size",
          ),
        )}`}
      />

      {orders.length === 0 ? (
        <EmptyState
          title={
            list.q
              ? "לא נמצאו הזמנות"
              : status === "all"
                ? "עדיין אין הזמנות"
                : "אין הזמנות בסטטוס הזה"
          }
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
                <th className="w-8 p-1" aria-label="פרטים" />
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
                <ExpandableRow
                  key={o.id}
                  testId={`order-row-${o.id}`}
                  rowProps={{ "data-source": o.source }}
                  colSpan={8}
                  details={<OrderDetails order={o} maySeeMoney={maySeeMoney} />}
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
                  <td className="p-3">
                    <Link href={`/customers/${o.customer.id}`} className="hover:underline">
                      {o.customer.business_name}
                    </Link>
                  </td>
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
                </ExpandableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 ? (
        <ListPager
          prefix=""
          params={list}
          total={total}
          baseHref={baseHrefFor("/orders", params)}
        />
      ) : null}
    </>
  );
}

type OrderRow = Awaited<ReturnType<typeof listOrdersPage>>["rows"][number];

/** What the arrow opens: the order's lines, and the facts not in the columns. */
function OrderDetails({ order, maySeeMoney }: { order: OrderRow; maySeeMoney: boolean }) {
  return (
    <div className="space-y-3">
      <DetailGrid
        items={[
          ["כמות שורות", <Ltr key="n">{order.items.length}</Ltr>],
          ...(maySeeMoney
            ? ([
                [
                  "תשלום",
                  <Badge key="p" tone={PAYMENT_TONE[order.payment_status as PaymentStatus]}>
                    {PAYMENT_STATUS_LABELS[order.payment_status as PaymentStatus]}
                  </Badge>,
                ],
              ] as Array<[string, React.ReactNode]>)
            : []),
          ["קובץ להזמנה", order.advertisement?.name ?? "—"],
          ["אושרה", order.approved_at ? <Ltr key="a">{formatDate(order.approved_at)}</Ltr> : "—"],
        ]}
      />
      {order.items.length > 0 ? (
        <table className="w-full text-xs" data-testid={`order-lines-${order.id}`}>
          <thead className="text-on-surface-variant">
            <tr>
              <th className="py-1 text-start font-medium">עיתון</th>
              <th className="py-1 text-start font-medium">תאריך</th>
              <th className="py-1 text-start font-medium">סוג עמוד</th>
              <th className="py-1 text-start font-medium">גודל</th>
              {maySeeMoney ? <th className="py-1 text-start font-medium">מחיר</th> : null}
              <th className="py-1 text-start font-medium">קובץ</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} className="border-t border-outline-variant">
                <td className="py-1">{i.newspaper.name}</td>
                <td className="py-1">
                  <Ltr>{formatDate(i.publication_date)}</Ltr>
                </td>
                <td className="py-1">{i.page_type.name}</td>
                <td className="py-1">
                  {i.ad_shape.name}{" "}
                  <span className="text-on-surface-variant">
                    (<Ltr>{`${i.ad_shape.cols}×${i.ad_shape.rows}`}</Ltr>)
                  </span>
                </td>
                {maySeeMoney ? (
                  <td className="py-1">
                    <Ltr>{formatMoney(Number(i.price))}</Ltr>
                  </td>
                ) : null}
                <td className="py-1">
                  {i.advertisement?.name ?? order.advertisement?.name ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
