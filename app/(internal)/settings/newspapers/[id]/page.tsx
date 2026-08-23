import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTenantContext } from "@/lib/auth/tenant";
import { canWrite, requireAccess } from "@/lib/auth/rbac";
import { getNewspaper, listAdShapes } from "@/lib/data/newspapers";
import { toMegabytes } from "@/lib/domain/newspaper";
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
  requireAccess(ctx.role, "settings");

  const { id } = await params;
  const [paper, shapes] = await Promise.all([getNewspaper(ctx.businessId, id), listAdShapes()]);
  if (!paper) notFound();

  const mayEdit = canWrite(ctx.role, "settings");

  return (
    <>
      <h1 className="mb-4 font-serif text-3xl font-semibold" data-testid="newspaper-name">
        {paper.name}
      </h1>
      <NewspaperTabs id={paper.id} />

      <section className="mb-10">
        <h2 className="mb-4 font-serif text-xl font-semibold">כללי</h2>
        <NewspaperForm
          action={updateNewspaperAction.bind(null, paper.id)}
          cancelHref="/settings/newspapers"
          initial={{
            name: paper.name,
            pageSize: paper.page_size as PageSizeKey,
            customWidthMm: paper.custom_width_mm?.toString() ?? "",
            customHeightMm: paper.custom_height_mm?.toString() ?? "",
            margin: paper.margin.toString(),
            printQuality: paper.print_quality,
            maxAdFileSizeMb: String(toMegabytes(paper.max_ad_file_size)),
          }}
        />
      </section>

      <PageTypes
        newspaperId={paper.id}
        readOnly={!mayEdit}
        shapes={shapes.map((s) => ({ id: s.id, name: s.name, sizeGroup: s.size_group }))}
        pageTypes={paper.page_types.map((pt) => ({
          id: pt.id,
          name: pt.name,
          allowedShapeIds: pt.allowed_shapes.map((a) => a.ad_shape_id),
        }))}
      />
    </>
  );
}
