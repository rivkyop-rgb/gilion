import type { Metadata } from "next";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { EmptyState } from "@/components/states";

export const metadata: Metadata = { title: "גבייה · Gilion" };

/**
 * Stage 08 builds this screen. It exists now as the guard fixture for FR-8:
 * a designer must be refused here by the server, not merely by a hidden menu
 * item (role-nav.spec.ts).
 */
export default async function BillingPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "billing");

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">גבייה ותשלומים</h1>
      <EmptyState title="נבנה בשלב 08" body="עדכון תשלום ידני, סטטוס תשלום ודוחות." />
    </>
  );
}
