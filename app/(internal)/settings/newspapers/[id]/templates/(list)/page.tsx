import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutGrid } from "lucide-react";

import { getTenantContext } from "@/lib/auth/tenant";
import { canWrite, requireAccess } from "@/lib/auth/rbac";
import { getNewspaper } from "@/lib/data/newspapers";
import { listTemplates } from "@/lib/data/templates";
import { EmptyState } from "@/components/states";
import { Ltr } from "@/components/ui/ltr";
import { NewspaperTabs } from "../../tabs";
import { NewTemplateForm } from "../new-template-form";

export const metadata: Metadata = { title: "תבניות שיבוץ · Gilion" };

export default async function TemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "settings");

  const { id } = await params;
  const paper = await getNewspaper(ctx.businessId, id);
  if (!paper) notFound();

  const templates = await listTemplates(ctx.businessId, id);
  const mayEdit = canWrite(ctx.role, "settings");

  return (
    <>
      <h1 className="mb-4 font-serif text-3xl font-semibold">{paper.name}</h1>
      <NewspaperTabs id={id} />

      <h2 className="mb-1 font-serif text-xl font-semibold">תבניות שיבוץ</h2>
      <p className="mb-4 text-sm text-on-surface-variant">
        תבנית קובעת אילו עמודים יש בגיליון ואיפה בדיוק אפשר לשבץ מודעה. גיליון נפתח מתבנית, ומעתיק
        אותה — שינוי בתבנית לא משנה גיליון קיים.
      </p>

      {templates.length === 0 ? (
        <EmptyState
          title="אין עדיין תבניות"
          body="בלי תבנית אי אפשר לפתוח גיליון. תבנית ראשונה אפשר לבנות בכמה דקות."
        />
      ) : (
        <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <li key={t.id}>
              <Link
                href={`/settings/newspapers/${id}/templates/${t.id}`}
                className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-4 transition hover:border-brand-gold hover:shadow-md"
              >
                <LayoutGrid className="size-5 text-primary-container" />
                <span>
                  <span className="block font-semibold">{t.name}</span>
                  <span className="block font-mono text-xs text-on-surface-variant">
                    <Ltr>{t._count.pages}</Ltr> עמודים
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {mayEdit ? <NewTemplateForm newspaperId={id} /> : null}
    </>
  );
}
