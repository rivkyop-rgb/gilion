import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { customerHistoryCounts } from "@/lib/data/customers";
import { deletionBlockedMessage } from "@/lib/domain/customer";
import { DeleteCustomer } from "./delete-customer";
import { getCustomer } from "@/lib/data/customers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { ConvertToRegular } from "./convert-to-regular";

export const metadata: Metadata = { title: "כרטיס לקוח · Gilion" };

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ converted?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers");

  const { id } = await params;
  const { converted } = await searchParams;

  // Scoped lookup: a customer of another business is not found, not forbidden.
  const customer = await getCustomer(ctx.businessId, id);
  if (!customer) notFound();

  const mayEdit = canWriteArea(ctx, "customers");
  // Deletion is admin-only — stricter than editing, and deliberately not tied
  // to the customers permission, which an admin may hand to sales.
  const mayDelete = ctx.role === "admin" || ctx.isSuperAdmin;
  const blockedReason = mayDelete
    ? deletionBlockedMessage(await customerHistoryCounts(ctx.businessId, customer.id))
    : null;
  const maySeeMoney = ctx.role !== "designer"; // FR-8

  return (
    <>
      {converted ? (
        <p
          role="status"
          data-testid="converted-toast"
          className="mb-4 rounded-sm bg-status-success-bg px-4 py-3 text-sm text-status-success-fg"
        >
          הלקוח הפך ללקוח קבוע. כל ההיסטוריה נשמרה.
        </p>
      ) : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-2 font-serif text-3xl font-semibold" data-testid="customer-name">
            {customer.business_name ?? customer.contact_name}
          </h1>
          <div className="flex items-center gap-3">
            <Badge
              tone={customer.customer_type === "casual" ? "debt" : "neutral"}
              data-testid="customer-type-badge"
            >
              {customer.customer_type === "casual" ? "מזדמן" : "קבוע"}
            </Badge>
            {customer.business_name ? (
              <span className="text-sm text-on-surface-variant">{customer.contact_name}</span>
            ) : null}
          </div>
        </div>

        {mayEdit ? (
          <div className="flex gap-2">
            {customer.customer_type === "casual" ? <ConvertToRegular id={customer.id} /> : null}
            <Button variant="secondary" asChild>
              <Link href={`/customers/${customer.id}/edit`}>
                <Pencil className="size-4" />
                עריכה
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {mayDelete ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <DeleteCustomer
            id={customer.id}
            name={customer.business_name ?? customer.contact_name}
            phone={customer.phone}
            email={customer.email}
            blocked={blockedReason}
          />
        </div>
      ) : null}

      <dl className="mb-8 grid gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-6 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-on-surface-variant">טלפון</dt>
          <dd className="mt-1">{customer.phone ? <Ltr>{customer.phone}</Ltr> : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-on-surface-variant">מייל</dt>
          <dd className="mt-1">{customer.email ? <Ltr>{customer.email}</Ltr> : "—"}</dd>
        </div>
        {maySeeMoney ? (
          <div data-testid="customer-debt">
            <dt className="text-xs text-on-surface-variant">יתרת חוב</dt>
            <dd className="mt-1">
              <Ltr>₪0</Ltr>
            </dd>
          </div>
        ) : null}
      </dl>

      <h2 className="mb-3 font-serif text-xl font-semibold">היסטוריה</h2>
      <EmptyState
        title="עדיין אין פעילות"
        body="פרסומים, הזמנות, מודעות ותשלומים של הלקוח יופיעו כאן — הם נבנים בשלבים 04, 05 ו־08."
      />
    </>
  );
}
