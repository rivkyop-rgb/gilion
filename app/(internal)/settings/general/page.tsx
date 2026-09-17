import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { businessName, loadSettings } from "@/lib/data/business-settings";
import { businessSlug } from "@/lib/data/portal-link";
import { portalUrl } from "@/lib/portal-origin";
import { GeneralForm } from "./general-form";
import { PortalLinkPanel } from "./portal-link-panel";

export const metadata: Metadata = { title: "כללי · Gilion" };

/**
 * The time-zone list comes from the runtime, never from a hand-written array
 * (stage 11 §כללי ולידציה). Resolved on the server so the browser is not sent
 * six hundred strings it will mostly not use — the field is a datalist.
 */
function timezones(): string[] {
  const supported = Intl.supportedValuesOf?.("timeZone");
  return supported && supported.length > 0 ? supported : ["Asia/Jerusalem", "UTC"];
}

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
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface"
      >
        <ArrowRight className="size-4" />
        חזרה להגדרות
      </Link>

      <h1 className="mb-1 font-serif text-3xl font-semibold">כללי</h1>
      <p className="mb-8 text-sm text-on-surface-variant">
        פרטי ההתקשרות של {name}, ואיך המערכת מציגה תאריכים וסכומים.
      </p>

      <PortalLinkPanel url={url} slug={slug} />

      <GeneralForm settings={settings} zones={timezones()} />
    </>
  );
}
