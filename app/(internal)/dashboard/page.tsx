import type { Metadata } from "next";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { EmptyState } from "@/components/states";
import { ROLE_LABELS } from "@/lib/auth/labels";

export const metadata: Metadata = { title: "לוח בקרה · Gilion" };

export default async function DashboardPage() {
  // Every server entry point starts here — conventions.md §9, no exceptions.
  const ctx = await getTenantContext();
  requireArea(ctx, "dashboard");

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">לוח בקרה</h1>
      <p className="mb-8 text-sm text-on-surface-variant">
        נכנסת כ־{ROLE_LABELS[ctx.role]}. התפריט מציג רק את האזורים שהתפקיד שלך מורשה לראות.
      </p>

      <EmptyState
        title="עוד אין כאן נתונים"
        body="הדשבורד התפעולי נבנה בשלב 10. עד אז המסך הזה מאשר שההתחברות, בחירת העסק והרשאות התפקיד עובדות."
      />
    </>
  );
}
