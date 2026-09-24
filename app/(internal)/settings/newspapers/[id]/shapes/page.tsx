import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listAdShapes, readAllowedCells } from "@/lib/data/ad-shapes";
import { newspaperGrid } from "@/lib/data/newspapers";
import { NewspaperTabs } from "../tabs";
import { ShapeCatalog } from "./shape-catalog";

export const metadata: Metadata = { title: "צורות פרסום · Gilion" };

/* No loading.tsx in this segment: streaming commits a 200 before the body
   runs, which would stop this route answering 404 to a cross-tenant id. */
export default async function ShapesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings");

  const { id } = await params;
  const resolved = await newspaperGrid(ctx.businessId, id);
  if (!resolved) notFound();
  const { paper, grid } = resolved;

  const shapes = await listAdShapes(ctx.businessId, paper.id);

  return (
    <>
      <h1 className="mb-4 page-title font-serif text-headline-lg font-semibold" data-testid="newspaper-name">
        {paper.name}
      </h1>
      <NewspaperTabs id={paper.id} />

      <ShapeCatalog
        newspaperId={paper.id}
        readOnly={!canWriteArea(ctx, "settings")}
        grid={{
          columns: grid.columns,
          rows: grid.rows,
          rowHeightMm: grid.rowHeightMm,
          gutterMm: grid.gutterMm,
          marginMm: grid.marginMm,
          columnWidthMm: grid.columnWidthMm,
          pageWidthMm: grid.pageWidthMm,
          pageHeightMm: grid.pageHeightMm,
        }}
        shapes={shapes.map((s) => ({
          id: s.id,
          name: s.name,
          cols: s.cols,
          rows: s.rows,
          positionMode: s.position_mode,
          allowedCells: readAllowedCells(s.allowed_cells) ?? [],
        }))}
      />
    </>
  );
}
