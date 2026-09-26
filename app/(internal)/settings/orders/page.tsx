import type { Metadata } from "next";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { internalOrdersNeedApproval } from "@/lib/data/orders";
import { OrderApprovalForm } from "./approval-form";

export const metadata: Metadata = { title: "תהליך הזמנות · הגדרות · Gilion" };

export default async function OrderSettingsPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  const current = await internalOrdersNeedApproval(ctx.businessId);

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">תהליך הזמנות</h1>
      <p className="mb-6 max-w-2xl text-sm text-on-surface-variant">
        פרסומים מחייבים נוצרים רק כשהזמנה מאושרת. כאן בוחרים אם הזמנה שמוזנת במשרד מאושרת ישירות, או
        ממתינה לאישור נפרד.
      </p>
      <OrderApprovalForm current={current} />
    </>
  );
}
