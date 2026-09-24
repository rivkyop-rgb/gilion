import type { Metadata } from "next";
import { Info } from "lucide-react";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { loadOverrides } from "@/lib/data/permissions";
import { PermissionMatrix } from "./permission-matrix";

export const metadata: Metadata = { title: "הרשאות · Gilion" };

export default async function PermissionsPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  const overrides = await loadOverrides(ctx.businessId);

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">הרשאות תפקידים</h1>
      <p className="mb-4 text-sm text-on-surface-variant">
        מה כל תפקיד יכול לראות ולערוך בעסק הזה. השינויים חלים על העסק שלך בלבד.
      </p>

      <div className="mb-6 flex items-start gap-2 rounded-sm bg-surface-container px-4 py-3 text-sm text-on-surface-variant">
        <Info className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="mb-1">
            נשמרים רק ההבדלים מברירת המחדל. אזור שלא נגעת בו ימשיך לעקוב אחרי ברירת המחדל של המערכת,
            גם אם היא תשתנה בעתיד.
          </p>
          <p>
            <strong>לקוח</strong> ו<strong>פורטל לקוח</strong> אינם ניתנים לעריכה — גבול הפורטל נקבע
            באפיון ואינו של עסק בודד לשנות. <strong>ניהול עסקים</strong> שמור למנהל־על.
          </p>
        </div>
      </div>

      <PermissionMatrix overrides={overrides} />
    </>
  );
}
