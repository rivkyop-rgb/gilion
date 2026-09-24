import type { Metadata } from "next";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { businessName, loadSettings } from "@/lib/data/business-settings";
import { BrandingForm } from "./branding-form";

export const metadata: Metadata = { title: "מותג · Gilion" };

export default async function BrandingPage() {
  const ctx = await getTenantContext();
  // Write, not read: there is nothing to look at here that is not also a
  // control. A role that may not change branding has no reason to be here.
  requireArea(ctx, "settings", "write");

  const [settings, name] = await Promise.all([
    loadSettings(ctx.businessId),
    businessName(ctx.businessId),
  ]);

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">מותג</h1>
      <p className="mb-8 text-sm text-on-surface-variant">
        הלוגו, ה־favicon והשם שמופיעים בסרגל הצד, בלשונית הדפדפן ובמסך ההתחברות. מה שלא הועלה כאן —
        מוצג בקובץ ברירת המחדל של המערכת.
      </p>

      <BrandingForm settings={settings} fallbackName={name} />
    </>
  );
}
