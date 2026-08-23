import type { Metadata } from "next";
import { getTenantContext } from "@/lib/auth/tenant";
import { requireAccess } from "@/lib/auth/rbac";
import { CustomerForm } from "../customer-form";
import { createCustomerAction } from "../actions";

export const metadata: Metadata = { title: "לקוח חדש · Gilion" };

export default async function NewCustomerPage() {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "customers", "write");

  return (
    <div className="max-w-[500px]">
      <h1 className="mb-1 font-serif text-3xl font-semibold">לקוח חדש</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        לקוח מזדמן אפשר להפוך לקבוע בהמשך בלי לאבד היסטוריה.
      </p>
      <CustomerForm action={createCustomerAction} cancelHref="/customers" />
    </div>
  );
}
