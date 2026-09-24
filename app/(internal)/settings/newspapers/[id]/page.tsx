import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { getNewspaper, gridOf, shapesForRescale } from "@/lib/data/newspapers";
import { listAdShapes } from "@/lib/data/ad-shapes";
import { toMegabytes } from "@/lib/domain/newspaper";
import { mmToCm, type DerivedGrid } from "@/lib/domain/grid";
import type { PageSizeKey } from "@/lib/domain/page-size";
import { NewspaperForm } from "../newspaper-form";
import { updateNewspaperAction } from "../../actions";
import { NewspaperTabs } from "./tabs";
import { PageTypes } from "./page-types";

export const metadata: Metadata = { title: "הגדרות עיתון · Gilion" };

/* No loading.tsx in this segment: streaming commits a 200 before the body
   runs, which would stop this route answering 404 to a cross-tenant id. */
export default async function NewspaperPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings");

  const { id } = await params;
  const paper = await getNewspaper(ctx.businessId, id);
  if (!paper) notFound();

  const shapes = await listAdShapes(ctx.businessId, paper.id);
  // A newspaper whose page size cannot be resolved has no grid to draw against;
  // the form below is where that gets fixed, so fall back to a 1x1 grid rather
  // than failing the page.
  // gridOf only fails on a "custom" page size missing its dimensions, which
  // validation refuses — this fallback keeps the screen rendering instead of
  // throwing if a row ever slips through.
  const grid = gridOf(paper) ?? UNRESOLVED_GRID;

  const mayEdit = canWriteArea(ctx, "settings");
  const catalogue = await shapesForRescale(ctx.businessId, paper.id);

  return (
    <>
      <h1 className="mb-4 page-title font-serif text-headline-lg font-semibold" data-testid="newspaper-name">
        {paper.name}
      </h1>
      <NewspaperTabs id={paper.id} />

      <section className="mb-10">
        <h2 className="mb-4 font-serif text-xl font-semibold">כללי</h2>
        <NewspaperForm
          action={updateNewspaperAction.bind(null, paper.id)}
          cancelHref="/settings/newspapers"
          // So the form can say what resizing the page does to the catalogue
          // before it is saved — the plan is computed from the same pure module
          // the Server Action applies (lib/domain/shape-rescale.ts).
          catalogue={catalogue}
          initial={{
            name: paper.name,
            pageSize: paper.page_size as PageSizeKey,
            // Stored in millimetres, shown and edited in centimetres.
            customWidthCm: cmString(paper.custom_width_mm),
            customHeightCm: cmString(paper.custom_height_mm),
            marginCm: cmString(paper.margin),
            printQuality: paper.print_quality,
            maxAdFileSizeMb: String(toMegabytes(paper.max_ad_file_size)),
            columns: String(paper.columns),
            rowHeightCm: cmString(paper.row_height_mm),
            gutterCm: cmString(paper.gutter_mm),
            publicationDays: paper.publication_days,
          }}
        />
      </section>

      <PageTypes
        newspaperId={paper.id}
        readOnly={!mayEdit}
        grid={grid}
        shapes={shapes.map((s) => ({ id: s.id, name: s.name, cols: s.cols, rows: s.rows }))}
        pageTypes={paper.page_types.map((pt) => ({
          id: pt.id,
          name: pt.name,
          allowedShapeIds: pt.allowed_shapes.map((a) => a.ad_shape_id),
          reserved: pt.reservations.map((area) => ({
            id: area.id,
            name: area.name,
            col: area.col,
            row: area.row,
            cols: area.cols,
            rows: area.rows,
            assetKey: area.asset_key,
          })),
        }))}
      />
    </>
  );
}

/** A stored millimetre value as the centimetre string the form edits. */
function cmString(mm: { toString(): string } | null | undefined): string {
  if (mm == null) return "";
  return String(mmToCm(Number(mm.toString())));
}

const UNRESOLVED_GRID: DerivedGrid = {
  columns: 1,
  rows: 1,
  rowHeightMm: 0,
  gutterMm: 0,
  marginMm: 0,
  columnWidthMm: 0,
  pageWidthMm: 0,
  pageHeightMm: 0,
};
