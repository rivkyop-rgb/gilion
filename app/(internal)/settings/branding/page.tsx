import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

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
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface"
      >
        {/* RTL: ArrowRight points towards the start of the line in Hebrew. */}
        <ArrowRight className="size-4" />
        חזרה להגדרות
      </Link>

      <h1 className="mb-1 font-serif text-3xl font-semibold">מותג</h1>
      <p className="mb-8 text-sm text-on-surface-variant">
        הלוגו, ה־favicon והשם שמופיעים בסרגל הצד, בלשונית הדפדפן ובמסך ההתחברות. מה שלא הועלה כאן —
        מוצג בקובץ ברירת המחדל של המערכת.
      </p>

      <BrandingForm settings={settings} fallbackName={name} />
    </>
  );
}
