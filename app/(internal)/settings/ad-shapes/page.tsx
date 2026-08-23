import type { Metadata } from "next";
import { getTenantContext } from "@/lib/auth/tenant";
import { requireAccess } from "@/lib/auth/rbac";
import { listAdShapes } from "@/lib/data/newspapers";
import { Badge } from "@/components/ui/badge";
import { ShapePreview } from "../shape-preview";

export const metadata: Metadata = { title: "צורות פרסום · Gilion" };

const GROUP_LABELS: Record<string, string> = {
  eighth: "שמינית",
  quarter: "רבע",
  half: "חצי",
  full: "מלא",
  strip: "רצועה",
  other: "אחר",
};

export default async function AdShapesPage() {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "settings");

  const shapes = await listAdShapes();

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">צורות פרסום</h1>
      <p className="mb-6 text-sm text-on-surface-variant">
        הקטלוג <strong>משותף לכל העסקים</strong> במערכת — זה היוצא מן הכלל היחיד בבידוד הנתונים. לכל
        עיתון נקבע בנפרד אילו צורות מותרות בכל סוג עמוד.
      </p>

      <div className="overflow-x-auto rounded-lg border border-outline-variant bg-surface-container-lowest">
        <table className="w-full text-sm">
          <thead className="bg-surface-container">
            <tr>
              <th className="p-3 text-start font-semibold">תצוגה</th>
              <th className="p-3 text-start font-semibold">שם</th>
              <th className="p-3 text-start font-semibold">קבוצת גודל</th>
            </tr>
          </thead>
          <tbody>
            {shapes.map((s) => (
              <tr key={s.id} className="border-t border-outline-variant">
                <td className="p-3">
                  <ShapePreview sizeGroup={s.size_group} />
                </td>
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3">
                  <Badge>{GROUP_LABELS[s.size_group] ?? s.size_group}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
