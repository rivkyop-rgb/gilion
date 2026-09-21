import { NextResponse } from "next/server";

import { canReadArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { getCustomer } from "@/lib/data/customers";
import {
  customerAdvertisements,
  customerOrders,
  customerPublications,
} from "@/lib/data/customer-activity";
import { customerAccount, paymentsForCustomer } from "@/lib/data/payments";
import { parseListParams } from "@/lib/domain/list-view";
import { AD_FILE_TYPE_LABELS, formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/domain/order-status";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/payment-status";
import { PAYMENT_RECORD_LABELS } from "@/lib/domain/payment";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";

/**
 * One list off a customer card, as a spreadsheet (user, 16/09/2026).
 *
 * **This reverses a recorded decision.** `docs/plan/08-payments-reports.md`
 * puts "ייצוא ל־Excel" out of scope and its Definition of Done ticks off that
 * there is none. The reversal is the user's to make and is written down in that
 * file and in `docs/plan/backlog.md` — not left for somebody to rediscover from
 * this route's existence.
 *
 * A Route Handler and not a Server Action, because this produces a FILE and
 * that is the line conventions.md §9 draws.
 *
 * CSV and not .xlsx: Excel opens CSV natively and edits it, and a real workbook
 * would mean a new dependency and a binary built on the server for a table that
 * is already a table. The one thing CSV gets wrong by default is Hebrew — Excel
 * reads a BOM-less UTF-8 file as the system code page and renders mojibake — so
 * the BOM below is the whole reason this works at all.
 */

const BOM = "﻿";

const DATE = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeZone: "Asia/Jerusalem" });

/**
 * One CSV field.
 *
 * Quoted whenever it holds a separator, a quote or a newline, with inner quotes
 * doubled — RFC 4180. A customer called `לוי, בע"מ` is not exotic.
 */
function cell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(headers: string[], rows: (string | number | null)[][]): string {
  return BOM + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}

/** The same label the screens print (orders/format.ts). */
const orderNumber = (n: number) => `ORD-${String(n).padStart(4, "0")}`;
const money = (v: unknown) => Number(v).toFixed(2);
const day = (d: Date | null) => (d ? DATE.format(d) : "");

/** Every row that matches the search, not just the page on screen. */
const ALL = 100_000;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; section: string }> },
) {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers");

  const { id, section } = await params;
  const url = new URL(_request.url);

  // Scoped lookup: a customer of another business is not found, not forbidden.
  const customer = await getCustomer(ctx.businessId, id);
  if (!customer) return new NextResponse("not found", { status: 404 });

  const list = parseListParams({ q: url.searchParams.get("q") ?? undefined });
  const query = { ...list, page: 1, size: ALL };

  // FR-8: a designer never receives payment data, and an export is a response
  // like any other. Refused here rather than merely unlinked in the page.
  const maySeeMoney = ctx.role !== "designer";

  const label = customer.business_name ?? customer.contact_name;
  let body: string;
  let name: string;

  switch (section) {
    case "orders": {
      if (!canReadArea(ctx, "orders") || !maySeeMoney) return forbidden();
      const { rows } = await customerOrders(ctx.businessId, customer.id, query);
      body = csv(
        ["הזמנה", "נפתחה", "אושרה", "פרסומים", "סטטוס", "סכום", "תשלום", "חשבונית"],
        rows.map((o) => [
          orderNumber(o.number),
          day(o.created_at),
          day(o.approved_at),
          o._count.publications,
          ORDER_STATUS_LABELS[o.status as OrderStatus],
          money(o.total_price),
          PAYMENT_STATUS_LABELS[o.payment_status as PaymentStatus],
          o.external_invoice_number ?? "",
        ]),
      );
      name = "orders";
      break;
    }

    case "publications": {
      const { rows } = await customerPublications(ctx.businessId, customer.id, query);
      body = csv(
        ["תאריך", "עיתון", "צורה", "סטטוס", "מודעה", "הזמנה", ...(maySeeMoney ? ["מחיר"] : [])],
        rows.map((p) => [
          day(p.publication_date),
          p.newspaper.name,
          p.ad_shape.name,
          PUBLICATION_STATUS_LABELS[p.status as PublicationStatus],
          p.advertisement_id ? "יש קובץ" : "חסר קובץ",
          orderNumber(p.order?.number ?? 0),
          ...(maySeeMoney ? [money(p.price)] : []),
        ]),
      );
      name = "publications";
      break;
    }

    case "advertisements": {
      if (!canReadArea(ctx, "advertisements")) return forbidden();
      const { rows } = await customerAdvertisements(ctx.businessId, customer.id, query);
      body = csv(
        ["שם", "סוג", "גודל", "הועלה", "סטטוס", "בשימוש בפרסומים"],
        rows.map((a) => [
          a.name,
          AD_FILE_TYPE_LABELS[a.file_type as AdFileType],
          formatBytes(a.file_size),
          day(a.uploaded_at),
          a.validation_status === "failed"
            ? "דורש טיפול"
            : a.status === "archived"
              ? "בארכיון"
              : "תקין",
          a._count.publications,
        ]),
      );
      name = "advertisements";
      break;
    }

    case "payments": {
      if (!maySeeMoney) return forbidden();
      const rows = await paymentsForCustomer(ctx.businessId, customer.id);
      body = csv(
        ["סכום", "תאריך", "חשבונית", "שיוך", "מצב", "עודכן על ידי", "עודכן"],
        rows.map((p) => [
          money(p.amount),
          day(p.payment_date),
          p.external_invoice_number ?? "",
          p.order_id ? orderNumber(p.order?.number ?? 0) : "יתרת הלקוח",
          PAYMENT_RECORD_LABELS[p.status as keyof typeof PAYMENT_RECORD_LABELS],
          p.updated_by.name,
          day(p.updated_at),
        ]),
      );
      name = "payments";
      break;
    }

    case "months": {
      if (!maySeeMoney) return forbidden();
      const { months } = await customerAccount(ctx.businessId, customer.id);
      body = csv(
        ["חודש", "לחיוב", "שולם", "נותר", "פרסומים"],
        months.map((m) => [
          m.label,
          money(m.billed),
          money(m.paid),
          money(m.open),
          m.publicationCount,
        ]),
      );
      name = "months";
      break;
    }

    default:
      return new NextResponse("unknown section", { status: 404 });
  }

  // The name reaches the browser twice: a plain ASCII fallback, and RFC 5987
  // UTF-8 for the Hebrew one. Without the fallback some clients save a file
  // called "ÖÄÜ"; without the UTF-8 form the rest lose the customer's name.
  const hebrew = `${label} — ${name}.csv`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"; filename*=UTF-8''${encodeURIComponent(hebrew)}`,
      // An export is a snapshot of live data; a cached one is a wrong one.
      "Cache-Control": "no-store",
    },
  });
}

function forbidden() {
  return new NextResponse("forbidden", { status: 403 });
}
