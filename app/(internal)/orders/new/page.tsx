import type { Metadata } from "next";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listCustomerOptions } from "@/lib/data/customers";
import { NewOrderForm } from "./new-order-form";

export const metadata: Metadata = { title: "הזמנה חדשה · Gilion" };

export default async function NewOrderPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "orders", "write");

  // Every customer, not the first page of them — see listCustomerOptions.
  const rows = await listCustomerOptions(ctx.businessId);

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">הזמנה חדשה</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        בחרי לקוח כדי לפתוח טיוטה. שורות הפרסום מתווספות בשלב הבא, וההזמנה לא תיצור שום פרסום מחייב
        עד שתאושר.
      </p>
      <NewOrderForm
        customers={rows.map((c) => ({
          value: c.id,
          label: c.business_name,
          // Searchable too: a customer is often remembered by phone, not name.
          hint: c.phone ?? undefined,
        }))}
      />
    </div>
  );
}
