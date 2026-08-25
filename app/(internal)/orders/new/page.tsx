import type { Metadata } from "next";
import { getTenantContext } from "@/lib/auth/tenant";
import { requireAccess } from "@/lib/auth/rbac";
import { listCustomers } from "@/lib/data/customers";
import { NewOrderForm } from "./new-order-form";

export const metadata: Metadata = { title: "הזמנה חדשה · Gilion" };

export default async function NewOrderPage() {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "orders", "write");

  const { rows } = await listCustomers(ctx.businessId, { perPage: 100 });

  return (
    <div className="max-w-[560px]">
      <h1 className="mb-1 font-serif text-3xl font-semibold">הזמנה חדשה</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        בחרי לקוח כדי לפתוח טיוטה. שורות הפרסום מתווספות בשלב הבא, וההזמנה לא תיצור שום פרסום מחייב
        עד שתאושר.
      </p>
      <NewOrderForm
        customers={rows.map((c) => ({
          id: c.id,
          label: c.business_name ? `${c.business_name} — ${c.contact_name}` : c.contact_name,
        }))}
      />
    </div>
  );
}
