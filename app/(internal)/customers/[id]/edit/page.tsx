import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { getCustomer } from "@/lib/data/customers";
import { CustomerForm } from "../../customer-form";
import { updateCustomerAction } from "../../actions";

export const metadata: Metadata = { title: "עריכת לקוח · Gilion" };

/*
 * Deliberately no loading.tsx here. Streaming commits a 200 before the page
 * body runs, so a loading boundary would stop this route from answering 404 to
 * a cross-tenant id — the check customer-tenant.spec.ts exists to enforce.
 * The page is a single indexed lookup, so there is nothing to wait for anyway.
 */

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");

  const { id } = await params;
  const customer = await getCustomer(ctx.businessId, id);
  if (!customer) notFound();

  return (
    <div className="max-w-[500px]">
      <h1 className="mb-1 font-serif text-3xl font-semibold">עריכת לקוח</h1>
      <div className="mb-6" />
      <CustomerForm
        action={updateCustomerAction.bind(null, id)}
        initial={{
          businessName: customer.business_name,
          taxId: customer.tax_id ?? "",
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          notes: customer.notes ?? "",
          contacts: customer.contacts.map((c) => ({
            name: c.name,
            role: c.role ?? "",
            phone: c.phone ?? "",
            email: c.email ?? "",
          })),
        }}
        cancelHref={`/customers/${id}`}
      />
    </div>
  );
}
