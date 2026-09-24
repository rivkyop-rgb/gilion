import type { Metadata } from "next";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { businessName, loadSettings } from "@/lib/data/business-settings";
import { businessSlug } from "@/lib/data/portal-link";
import { portalUrl } from "@/lib/portal-origin";
import { GeneralForm } from "./general-form";
import { PortalLinkPanel } from "./portal-link-panel";

export const metadata: Metadata = { title: "כללי · Gilion" };

/**
 * The publisher's own details, and the portal link for this business.
 *
 * There was a "display" block here too — time zone, date format, currency —
 * removed on 23/09/2026 because nothing read it (conventions.md §1 fixes all
 * three product-wide). See lib/domain/business-settings.ts.
 */
export default async function GeneralSettingsPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  const [settings, name, slug] = await Promise.all([
    loadSettings(ctx.businessId),
    businessName(ctx.businessId),
    businessSlug(ctx.businessId),
  ]);
  const url = await portalUrl(slug);

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">כללי</h1>
      <p className="mb-8 text-sm text-on-surface-variant">
        פרטי ההתקשרות של {name}, ואיך המערכת מציגה תאריכים וסכומים.
      </p>

      <PortalLinkPanel url={url} slug={slug} />

      <GeneralForm settings={settings} />
    </>
  );
}
