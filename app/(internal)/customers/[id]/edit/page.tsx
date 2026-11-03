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
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">עריכת לקוח</h1>
      <div className="mb-6" />
      <CustomerForm
        customerId={customer.id}
        action={updateCustomerAction.bind(null, id)}
        initial={{
          businessName: customer.business_name,
          taxId: customer.tax_id ?? "",
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          notes: customer.notes ?? "",
          preferredPage: customer.preferred_page ? String(customer.preferred_page) : "",
          noAutoPlace: customer.no_auto_place,
          contacts: customer.contacts.map((c) => ({
            name: c.name,
            role: c.role ?? "",
            phone: c.phone ?? "",
            email: c.email ?? "",
            receivesReminders: c.receives_reminders,
            receivesTearSheets: c.receives_tear_sheets,
            receivesBilling: c.receives_billing,
          })),
        }}
        cancelHref={`/customers/${id}`}
      />
    </div>
  );
}
