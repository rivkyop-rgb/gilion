import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { pricingData } from "@/lib/data/newspapers";
import { buildMatrix } from "@/lib/domain/pricing";
import { EmptyState } from "@/components/states";
import { NewspaperTabs } from "../tabs";
import { PricingMatrix } from "./pricing-matrix";

export const metadata: Metadata = { title: "מחירון · Gilion" };

export default async function PricingPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  // sales and accounting read the price list to quote an order; only admin edits.
  requireArea(ctx, "settings");

  const { id } = await params;
  const data = await pricingData(ctx.businessId, id);
  if (!data) notFound();

  const rows = buildMatrix(
    data.newspaper.page_types.map((pt) => ({ id: pt.id, name: pt.name })),
    data.shapes.map((s) => ({ id: s.id, name: s.name })),
    data.rules,
    data.allowed,
  );

  return (
    <>
      <h1 className="mb-4 font-serif text-3xl font-semibold">{data.newspaper.name}</h1>
      <NewspaperTabs id={id} />

      <h2 className="mb-1 font-serif text-xl font-semibold">מחירון</h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        המחיר כאן הוא <strong>ברירת מחדל בלבד</strong>. ברגע שהזמנה מאושרת המחיר מועתק לפרסום,
        ושינוי כאן לא ישנה פרסומים קיימים.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="אין עדיין סוגי עמודים"
          body="המחירון נבנה מהצטלבות של סוגי עמודים וצורות פרסום. יש להגדיר קודם סוגי עמודים בלשונית הראשונה."
        />
      ) : (
        <PricingMatrix
          newspaperId={id}
          rows={rows}
          shapes={data.shapes.map((s) => ({ id: s.id, name: s.name }))}
          readOnly={!canWriteArea(ctx, "settings")}
        />
      )}
    </>
  );
}
