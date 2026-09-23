import type { Metadata } from "next";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { CustomerForm } from "../customer-form";
import { createCustomerAction } from "../actions";

export const metadata: Metadata = { title: "לקוח חדש · Gilion" };

export default async function NewCustomerPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");

  return (
    <div className="max-w-[500px]">
      <h1 className="mb-1 font-serif text-3xl font-semibold">לקוח חדש</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        פרטי העסק, ואנשי הקשר בו עם התפקיד של כל אחד.
      </p>
      <CustomerForm action={createCustomerAction} cancelHref="/customers" />
    </div>
  );
}
