import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { loadSettings } from "@/lib/data/business-settings";
import { ThemeForm } from "./theme-form";

export const metadata: Metadata = { title: "צבעים · Gilion" };

export default async function ThemePage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  const settings = await loadSettings(ctx.businessId);

  return (
    <>
      <Link
        href="/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface"
      >
        <ArrowRight className="size-4" />
        חזרה להגדרות
      </Link>

      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">צבעים</h1>
      <p className="mb-8 text-sm text-on-surface-variant">
        השינוי נכנס לתוקף בכל המערכת מיד אחרי השמירה — בלי בנייה מחדש ובלי גרסה חדשה. צבע שלא נגעת
        בו ממשיך לעקוב אחרי ברירת המחדל גם אם היא תשתנה.
      </p>

      <ThemeForm colors={settings.colors} />
    </>
  );
}
