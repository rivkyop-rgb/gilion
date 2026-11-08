import { NextResponse } from "next/server";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { getCustomer } from "@/lib/data/customers";
import { customerStatement } from "@/lib/data/payments";
import { businessName, loadSettings } from "@/lib/data/business-settings";
import { formatDate, formatMoney, orderNumber } from "@/lib/domain/format";
import { buildStatementHtml } from "@/lib/pdf/statement-html";
import { renderPdf } from "@/lib/pdf/generate";
import { brandDataUri } from "@/lib/pdf/artwork";

export const dynamic = "force-dynamic";

/**
 * A customer's statement as a PDF (08/11/2026). Money, so the billing area's
 * permission — a designer, who never sees money (FR-8), cannot download it.
 * Tenant-scoped: a customer of another business is not found.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing");
  const { id } = await params;

  const customer = await getCustomer(ctx.businessId, id);
  if (!customer) return new NextResponse("not found", { status: 404 });

  const [statement, name, settings] = await Promise.all([
    customerStatement(ctx.businessId, customer.id),
    businessName(ctx.businessId),
    loadSettings(ctx.businessId),
  ]);
  const { account } = statement;
  const logo = await brandDataUri(settings.logoFullFileKey ?? settings.markFileKey);
  const contact = [settings.contactPhone, settings.contactEmail].filter(Boolean).join(" · ");

  const html = buildStatementHtml({
    businessName: name,
    logo,
    businessContact: contact || null,
    customerName: customer.business_name,
    customerTaxId: customer.tax_id ?? null,
    issuedOn: formatDate(new Date()),
    rows: statement.publications.map((p) => ({
      date: formatDate(p.date),
      newspaper: p.newspaper,
      shape: p.shape,
      order: orderNumber(p.orderNumber),
      ran: p.ran,
      price: formatMoney(p.price),
      covered: formatMoney(p.covered),
      open: formatMoney(p.open),
    })),
    payments: statement.payments.map((p) => ({
      date: p.date ? formatDate(p.date) : "",
      amount: formatMoney(p.amount),
      invoice: p.invoice ?? "",
      order: p.orderNumber ? orderNumber(p.orderNumber) : "יתרת הלקוח",
    })),
    summary: {
      billed: formatMoney(account.billed),
      settled: formatMoney(account.settled),
      outstanding: formatMoney(account.outstanding),
      ranOpen: formatMoney(account.ranOpen),
      upcomingOpen: formatMoney(account.upcomingOpen),
      credit: statement.credit > 0 ? formatMoney(statement.credit) : null,
    },
  });

  const pdf = await renderPdf(html, "standard");
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="statement-${new Date().toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
