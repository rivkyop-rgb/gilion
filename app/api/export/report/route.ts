import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { billingReport, publicationReport } from "@/lib/data/payments";
import { winbackReport } from "@/lib/data/winback";
import { resolvePeriod, type PeriodKind } from "@/lib/domain/payment-report";
import type { PublicationLens } from "@/lib/domain/publication-report";
import { PAYMENT_STATUS_LABELS, type PaymentStatus } from "@/lib/domain/payment-status";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { formatDate, orderNumber } from "@/lib/domain/format";
import { csvResponse, toCsv } from "@/lib/domain/csv";

const PERIODS: PeriodKind[] = ["week", "month", "custom"];
const LENSES: PublicationLens[] = ["all", "running", "missing_ad", "unplaced", "owing"];

/**
 * Whichever report tab is on screen, as a spreadsheet (08/11/2026). Reads the
 * same URL parameters as /reports and resolves them the same way, so the file
 * holds exactly the rows the screen counts — all of them, not one page.
 */
export async function GET(request: Request) {
  const ctx = await getTenantContext();
  requireArea(ctx, "reports");
  const p = new URL(request.url).searchParams;
  const get = (k: string) => p.get(k) ?? "";

  const tab = get("tab") === "publications" || get("tab") === "winback" ? get("tab") : "payments";
  const period = PERIODS.includes(get("period") as PeriodKind) ? (get("period") as PeriodKind) : "month";
  const range = resolvePeriod(period, get("anchor"), { from: get("from"), to: get("to") });
  const filters = {
    from: range.from,
    to: range.to,
    newspaperId: get("newspaper") || "all",
    customerId: get("customer") || "all",
  };
  const money = (n: number) => n.toFixed(2);

  if (tab === "payments") {
    const { rows } = await billingReport(ctx.businessId, filters);
    return csvResponse(
      toCsv(
        ["לקוח", "פרסומים", "סכום לתשלום", "שולם", "יתרה", "חשבוניות"],
        rows.map((r) => [
          r.customerLabel,
          r.publicationCount,
          money(r.billed),
          money(r.paid),
          money(r.outstanding),
          r.invoiceNumbers.join(" "),
        ]),
      ),
      "payments-report",
    );
  }

  if (tab === "publications") {
    const lens = LENSES.includes(get("lens") as PublicationLens) ? (get("lens") as PublicationLens) : "all";
    const { rows } = await publicationReport(ctx.businessId, { ...filters, lens });
    return csvResponse(
      toCsv(
        ["לקוח", "עיתון", "תאריך", "צורה", "סטטוס פרסום", "שיבוץ", "תשלום", "הזמנה"],
        rows.map((r) => [
          r.customerLabel,
          r.newspaper,
          formatDate(r.date),
          r.shape,
          PUBLICATION_STATUS_LABELS[r.status as PublicationStatus],
          r.placementStatus === "placed" ? "שובץ" : "לא שובץ",
          PAYMENT_STATUS_LABELS[r.paymentStatus as PaymentStatus],
          orderNumber(r.orderNumber),
        ]),
      ),
      "publications-report",
    );
  }

  const all = await winbackReport(ctx.businessId, filters, {
    shapeId: get("shape") || undefined,
    minCount: Number(get("min")) || undefined,
  });
  const rows = get("returned") ? all : all.filter((r) => !r.returned);
  return csvResponse(
    toCsv(
      ["לקוח", "פרסומים בתקופה", "פרסום אחרון", "עיתונים", "גודל אחרון", "הזמין שוב", "טלפון", "מייל"],
      rows.map((r) => [
        r.customerName,
        r.count,
        formatDate(r.lastDate),
        r.newspapers.join(" · "),
        r.lastShape,
        r.returned ? "כן" : "לא",
        r.phone ?? "",
        r.email ?? "",
      ]),
    ),
    "winback-report",
  );
}
