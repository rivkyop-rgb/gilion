import type { Metadata } from "next";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import Link from "next/link";
import { listCustomerOptions } from "@/lib/data/customers";
import { listNewspapers } from "@/lib/data/newspapers";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { NewOrderForm } from "./new-order-form";

export const metadata: Metadata = { title: "הזמנה חדשה · Gilion" };

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "orders", "write");

  // Every customer, not the first page of them — see listCustomerOptions.
  const rows = await listCustomerOptions(ctx.businessId);
  // From a customer's card: that customer is already chosen. Only if it is
  // really one of this business's — an id from the URL is not trusted blind.
  const { customer } = await searchParams;
  const preselected = rows.some((c) => c.id === customer) ? customer! : "";

  // No newspaper, nothing to sell: say so before a customer is picked and a
  // draft is opened that can never get a line (08/11/2026).
  if ((await listNewspapers(ctx.businessId)).length === 0) {
    return (
      <div className="max-w-[1100px]">
        <h1 className="mb-6 page-title font-serif text-headline-lg font-semibold">הזמנה חדשה</h1>
        <EmptyState
          title="אין עדיין עיתון"
          body="הזמנה מוכרת מקום בעיתון. קודם פותחים עיתון ומגדירים לו גודל עמוד ומחירון."
          action={
            <Button asChild>
              <Link href="/settings/newspapers/new">פתיחת עיתון</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="max-w-[1100px]">
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">הזמנה חדשה</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        בחרי לקוח כדי לפתוח טיוטה. שורות הפרסום מתווספות בשלב הבא.
      </p>
      <NewOrderForm
        defaultCustomerId={preselected}
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
