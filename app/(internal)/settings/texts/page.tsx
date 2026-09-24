import type { Metadata } from "next";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { loadSettings } from "@/lib/data/business-settings";
import { TextsForm } from "./texts-form";

export const metadata: Metadata = { title: "טקסטים · Gilion" };

export default async function TextsPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings", "write");

  const settings = await loadSettings(ctx.businessId);

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">טקסטים</h1>
      <p className="mb-8 text-sm text-on-surface-variant">
        המשפטים שהמשתמשים והלקוחות קוראים. שדה ריק מציג את נוסח ברירת המחדל — הוא כתוב באפור בתוך
        השדה, כך שברור מה יופיע אם לא תכתבי כלום.
      </p>

      <TextsForm texts={settings.texts} />
    </>
  );
}
