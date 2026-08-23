import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { getTenantContext } from "@/lib/auth/tenant";
import { canWrite, requireAccess } from "@/lib/auth/rbac";
import { listNewspapers } from "@/lib/data/newspapers";
import { toMegabytes } from "@/lib/domain/newspaper";
import { PAGE_SIZE_LABELS, type PageSizeKey } from "@/lib/domain/page-size";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "עיתונים · Gilion" };

/*
 * In a (list) route group so its loading.tsx covers only this page — a loading
 * boundary streams a 200 before the page body runs, which would stop
 * /settings/newspapers/[id] answering 404 to a cross-tenant id.
 * Same lesson as docs/plan/02-customers.md §סטיות.
 */
export default async function NewspapersPage() {
  const ctx = await getTenantContext();
  requireAccess(ctx.role, "settings");
  const mayEdit = canWrite(ctx.role, "settings");

  const papers = await listNewspapers(ctx.businessId);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 font-serif text-3xl font-semibold">עיתונים</h1>
          <p className="text-sm text-on-surface-variant">
            לכל עיתון גודל עמוד, סוגי עמודים, מחירון ותבניות שיבוץ משלו.
          </p>
        </div>
        {mayEdit ? (
          <Button asChild>
            <Link href="/settings/newspapers/new" data-testid="new-newspaper">
              <Plus className="size-4" />
              עיתון חדש
            </Link>
          </Button>
        ) : null}
      </div>

      {papers.length === 0 ? (
        <EmptyState
          title="עדיין אין עיתונים"
          body="עיתון הוא נקודת ההתחלה — בלעדיו אין סוגי עמודים, אין מחירון ואין תבנית לשבץ לתוכה."
          action={
            mayEdit ? (
              <Button asChild>
                <Link href="/settings/newspapers/new">עיתון חדש</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="newspaper-cards">
          {papers.map((p) => (
            <Link
              key={p.id}
              href={`/settings/newspapers/${p.id}`}
              className="rounded-xl border border-outline-variant bg-surface-container-lowest p-5 transition hover:border-brand-gold hover:shadow-md"
            >
              <h2 className="mb-2 font-serif text-xl font-semibold">{p.name}</h2>
              <p className="font-mono text-xs tracking-[0.05em] text-on-surface-variant">
                <Ltr>{PAGE_SIZE_LABELS[p.page_size as PageSizeKey] ?? p.page_size}</Ltr>
              </p>
              <dl className="mt-4 flex gap-4 text-xs text-on-surface-variant">
                <div>
                  <dt>סוגי עמודים</dt>
                  <dd className="font-mono text-base text-on-surface">
                    <Ltr>{p._count.page_types}</Ltr>
                  </dd>
                </div>
                <div>
                  <dt>תבניות</dt>
                  <dd className="font-mono text-base text-on-surface">
                    <Ltr>{p._count.templates}</Ltr>
                  </dd>
                </div>
                <div>
                  <dt>קובץ מקסימלי</dt>
                  <dd className="font-mono text-base text-on-surface">
                    <Ltr>{toMegabytes(p.max_ad_file_size)}MB</Ltr>
                  </dd>
                </div>
              </dl>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
