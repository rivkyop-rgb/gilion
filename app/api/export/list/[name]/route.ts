import { NextResponse } from "next/server";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listCustomers } from "@/lib/data/customers";
import { listOrdersPage } from "@/lib/data/orders";
import { listPublicationsPage } from "@/lib/data/publications";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/domain/order-status";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/payment-status";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { formatDate, orderNumber } from "@/lib/domain/format";
import { csvResponse, toCsv } from "@/lib/domain/csv";

/** Every row that matches, not the page on screen. */
const ALL = { page: 1, size: 100_000 };

/**
 * The main lists as spreadsheets, with the filters in the URL (08/11/2026 —
 * the 29/09 decision "every table: search, rows, export, paging" had export
 * only on the customer card). Each case reads the same parameters its screen
 * reads, and follows the same FR-8 rule: a designer never receives money.
 */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const ctx = await getTenantContext();
  const { name } = await params;
  const p = new URL(request.url).searchParams;
  const get = (k: string, fallback = "all") => p.get(k) || fallback;
  const q = p.get("q") ?? "";
  const maySeeMoney = ctx.role !== "designer";

  switch (name) {
    case "orders": {
      requireArea(ctx, "orders");
      const { rows } = await listOrdersPage(
        ctx.businessId,
        {
          status: get("status"),
          source: get("source"),
          customerId: get("customer"),
          newspaperId: p.get("newspaper") ?? undefined,
          shapeId: p.get("shape") ?? undefined,
          payment: maySeeMoney ? (p.get("payment") ?? undefined) : undefined,
          from: p.get("from") ?? undefined,
          to: p.get("to") ?? undefined,
        },
        { ...ALL, q },
      );
      return csvResponse(
        toCsv(
          ["הזמנה", "לקוח", "נפתחה", "פרסומים", "סטטוס", "מקור", ...(maySeeMoney ? ["סכום", "תשלום"] : [])],
          rows.map((o) => [
            orderNumber(o.number),
            o.customer.business_name,
            formatDate(o.created_at),
            o._count.publications,
            ORDER_STATUS_LABELS[o.status as OrderStatus],
            o.source === "customer_portal" ? "פורטל לקוח" : "הוזן במשרד",
            ...(maySeeMoney
              ? [Number(o.total_price).toFixed(2), PAYMENT_STATUS_LABELS[o.payment_status as PaymentStatus]]
              : []),
          ]),
        ),
        "orders",
      );
    }

    case "publications": {
      requireArea(ctx, "publications");
      const { rows } = await listPublicationsPage(
        ctx.businessId,
        {
          newspaperId: get("newspaper"),
          status: get("status"),
          from: p.get("from") ?? "",
          to: p.get("to") ?? "",
          customerId: get("customer"),
          attention: get("attention"),
          shapeId: get("shape"),
          payment: maySeeMoney ? get("payment") : "all",
          source: get("source"),
          q,
        },
        { ...ALL, q },
      );
      return csvResponse(
        toCsv(
          ["תאריך", "לקוח", "עיתון", "גודל", "סוג עמוד", "סטטוס", "מודעה", "הזמנה", ...(maySeeMoney ? ["מחיר"] : [])],
          rows.map((r) => [
            formatDate(r.publication_date),
            r.customer.business_name,
            r.newspaper.name,
            r.ad_shape.name,
            r.order_item?.page_type?.name ?? "",
            PUBLICATION_STATUS_LABELS[r.status as PublicationStatus],
            r.advertisement_id ? "יש קובץ" : "חסר קובץ",
            orderNumber(r.order?.number ?? 0),
            ...(maySeeMoney ? [r.price == null ? "" : Number(r.price).toFixed(2)] : []),
          ]),
        ),
        "publications",
      );
    }

    case "customers": {
      requireArea(ctx, "customers");
      // listCustomers pages at most 100 at a time; walk every page.
      const all = [];
      for (let page = 1; ; page++) {
        const { rows, total } = await listCustomers(ctx.businessId, { search: q, page, perPage: 100 });
        all.push(...rows);
        if (all.length >= total || rows.length === 0) break;
      }
      return csvResponse(
        toCsv(
          ["שם העסק", "ח.פ / ע.מ", "טלפון", "מייל", "עמוד קבוע"],
          all.map((c) => [c.business_name, c.tax_id ?? "", c.phone ?? "", c.email ?? "", c.preferred_page ?? ""]),
        ),
        "customers",
      );
    }
  }
  return new NextResponse("not found", { status: 404 });
}
