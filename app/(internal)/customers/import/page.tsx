import type { Metadata } from "next";
import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = { title: "ייבוא לקוחות · Gilion" };

export default async function CustomerImportPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "customers", "write");
  return (
    <div className="max-w-6xl">
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">ייבוא לקוחות מאקסל</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        מעלים קובץ, רואים כל שורה ומה יקרה איתה, ורק אז מייבאים.
      </p>
      <ImportFlow />
    </div>
  );
}
