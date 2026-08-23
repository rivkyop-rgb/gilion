import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { getTenantContext } from "@/lib/auth/tenant";
import { canWrite, requireAccess } from "@/lib/auth/rbac";
import { getTemplate } from "@/lib/data/templates";
import { listAdShapes, getNewspaper } from "@/lib/data/newspapers";
import { pageDimensions } from "@/lib/domain/page-size";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "עורך תבנית · Gilion" };

export default async function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string; tid: string }>;
}) {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "settings");

  const { id, tid } = await params;
  const [template, shapes, paper] = await Promise.all([
    getTemplate(ctx.businessId, tid),
    listAdShapes(),
    getNewspaper(ctx.businessId, id),
  ]);
  if (!template || !paper) notFound();

  const dims = pageDimensions(
    template.newspaper.page_size,
    template.newspaper.custom_width_mm ? Number(template.newspaper.custom_width_mm) : null,
    template.newspaper.custom_height_mm ? Number(template.newspaper.custom_height_mm) : null,
  );

  return (
    <>
      <Link
        href={`/settings/newspapers/${id}/templates`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-on-surface-variant hover:text-on-surface"
      >
        {/* RTL: ArrowRight points back toward the start of the line in Hebrew */}
        <ArrowRight className="size-4" />
        חזרה לתבניות
      </Link>

      <h1 className="mb-1 font-serif text-3xl font-semibold" data-testid="template-heading">
        {template.name}
      </h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        {template.newspaper.name} · הסלוטים נשמרים באחוזים מהעמוד, וההמרה למ״מ קורית בהפקת ה־PDF.
      </p>

      <TemplateEditor
        newspaperId={id}
        templateId={tid}
        aspectRatio={dims ? dims.width / dims.height : 0.7}
        readOnly={!canWrite(ctx.role, "settings")}
        shapes={shapes.map((s) => ({ id: s.id, name: s.name, sizeGroup: s.size_group }))}
        pageTypes={paper.page_types.map((pt) => ({ id: pt.id, name: pt.name }))}
        pages={template.pages.map((p) => ({
          id: p.id,
          pageNumber: p.page_number,
          pageTypeId: p.page_type_id,
          pageTypeName: p.page_type.name,
          allowedShapeIds: p.page_type.allowed_shapes.map((a) => a.ad_shape_id),
          slots: p.slots.map((s) => {
            const pos = s.position as { x: number; y: number };
            return {
              id: s.id,
              shapeName: s.ad_shape.name,
              x: pos.x,
              y: pos.y,
              width: Number(s.width),
              height: Number(s.height),
            };
          }),
        }))}
      />
    </>
  );
}
