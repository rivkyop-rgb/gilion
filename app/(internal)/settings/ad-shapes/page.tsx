import type { Metadata } from "next";
import Link from "next/link";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listAdShapes } from "@/lib/data/ad-shapes";
import { gridOf, listNewspapers } from "@/lib/data/newspapers";
import { formatCm } from "@/lib/domain/grid";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { ShapePreview } from "../shape-preview";
import { shapeSize } from "../shape-size";

export const metadata: Metadata = { title: "צורות פרסום · Gilion" };

/**
 * A read-only overview of every newspaper's shape catalogue.
 *
 * The catalogue is edited per newspaper, because a shape's size is expressed in
 * that newspaper's grid units and there is no grid to draw against here.
 */
export default async function AdShapesPage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings");

  const papers = await listNewspapers(ctx.businessId);
  const catalogues = await Promise.all(
    papers.map(async (paper) => ({
      paper,
      grid: gridOf(paper),
      shapes: await listAdShapes(ctx.businessId, paper.id),
    })),
  );

  return (
    <>
      <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">צורות פרסום</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        לכל עיתון קטלוג צורות משלו, שנוצר משש צורות בסיס וניתן לעריכה מלאה. הגודל נמדד בתאי הגריד של
        אותו עיתון, ולכן העריכה נעשית בתוך העיתון.
      </p>

      {catalogues.length === 0 ? (
        <EmptyState title="עדיין אין עיתונים" body="קטלוג הצורות נוצר יחד עם העיתון הראשון." />
      ) : null}

      {catalogues.map(({ paper, grid, shapes }) => (
        <section key={paper.id} className="mb-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl font-semibold">{paper.name}</h2>
            <Link
              href={`/settings/newspapers/${paper.id}/shapes`}
              className="text-sm text-on-surface-variant underline hover:text-on-surface"
            >
              עריכת הקטלוג
            </Link>
          </div>

          {grid ? (
            <p className="mb-3 text-xs text-on-surface-variant">
              חלוקת העמוד:{" "}
              <Ltr>{`${grid.columns} עמודות ברוחב ${formatCm(grid.columnWidthMm)} ס״מ`}</Ltr>
            </p>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
            <table className="w-full text-sm">
              <thead className="bg-surface-container">
                <tr>
                  <th className="p-3 text-start font-semibold">תצוגה</th>
                  <th className="p-3 text-start font-semibold">שם</th>
                  <th className="p-3 text-start font-semibold">גודל</th>
                  <th className="p-3 text-start font-semibold">מיקום מותר</th>
                </tr>
              </thead>
              <tbody>
                {shapes.map((s) => (
                  <tr key={s.id} className="border-t border-outline-variant">
                    <td className="p-3">
                      <ShapePreview
                        cols={s.cols}
                        rows={s.rows}
                        grid={grid ?? { columns: s.cols, rows: s.rows }}
                      />
                    </td>
                    <td className="p-3 font-medium">{s.name}</td>
                    <td className="p-3">
                      <Ltr>{grid ? shapeSize(s, grid) : "—"}</Ltr>
                    </td>
                    <td className="p-3">
                      {s.position_mode === "anywhere" ? (
                        <span className="text-on-surface-variant">בכל מקום בעמוד</span>
                      ) : (
                        <Badge>אזור מוגבל</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}
