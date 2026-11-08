import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { billingCustomers } from "@/lib/data/payments";
import { PAYMENT_STATUS_LABELS } from "@/lib/domain/payment-status";
import { csvResponse, toCsv } from "@/lib/domain/csv";

/**
 * The billing list as a spreadsheet, with the filters in the URL (08/11/2026).
 * Every matching row, not the page on screen — the accountant wants the list.
 */
export async function GET(request: Request) {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing");
  const url = new URL(request.url);
  const rows = await billingCustomers(ctx.businessId, {
    status: url.searchParams.get("status") ?? "all",
    q: url.searchParams.get("q") ?? "",
  });
  const money = (n: number) => n.toFixed(2);
  return csvResponse(
    toCsv(
      ["לקוח", "הזמנות", "סכום לתשלום", "שולם", "יתרה פתוחה", "מתוכה חוב (פורסם)", "זיכוי", "סטטוס", "חשבוניות"],
      rows.map((r) => [
        r.label,
        r.orderCount,
        money(r.billed),
        money(r.paid),
        money(r.outstanding),
        money(r.debt),
        money(r.credit),
        PAYMENT_STATUS_LABELS[r.status],
        r.invoiceNumbers.join(" "),
      ]),
    ),
    "billing",
  );
}
