import type { Metadata } from "next";
import { ListPager, ListToolbar } from "@/components/ui/list-toolbar";
import { clampPage, parseListParams, skipFor } from "@/lib/domain/list-view";
import Link from "next/link";
import { Plus } from "lucide-react";

import { canWriteArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { formatCm } from "@/lib/domain/grid";
import { gridOf, listNewspapers } from "@/lib/data/newspapers";
import { toMegabytes } from "@/lib/domain/newspaper";
import { PAGE_SIZE_LABELS, type PageSizeKey } from "@/lib/domain/page-size";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { formatDays, hasSchedule } from "@/lib/domain/publication-days";
import { DuplicateNewspaper } from "./duplicate-newspaper";

export const metadata: Metadata = { title: "עיתונים · Gilion" };

/*
 * In a (list) route group so its loading.tsx covers only this page — a loading
 * boundary streams a 200 before the page body runs, which would stop
 * /settings/newspapers/[id] answering 404 to a cross-tenant id.
 * Same lesson as docs/plan/02-customers.md §סטיות.
 */
export default async function NewspapersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; size?: string; q?: string }>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "settings");
  const mayEdit = canWriteArea(ctx, "settings");

  const all = await listNewspapers(ctx.businessId);
  const requested = parseListParams(await searchParams);
  const needle = requested.q.toLowerCase();
  const matched = needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all;
  const list = clampPage(requested, matched.length);
  const papers = matched.slice(skipFor(list), skipFor(list) + list.size);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 page-title font-serif text-headline-lg font-semibold">עיתונים</h1>
          <p className="text-sm text-on-surface-variant">
            לכל עיתון גודל עמוד, חלוקת עמוד לגריד, סוגי עמודים, צורות פרסום ומחירון משלו.
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

      {all.length > 0 ? (
        <ListToolbar
          prefix=""
          params={list}
          total={matched.length}
          baseHref="/settings/newspapers"
          searchLabel="שם העיתון"
        />
      ) : null}

      {papers.length === 0 ? (
        <EmptyState
          title={needle ? "לא נמצאו עיתונים" : "עדיין אין עיתונים"}
          body="עיתון הוא נקודת ההתחלה — בלעדיו אין חלוקת עמוד, אין צורות פרסום ואין מחירון."
          action={
            mayEdit ? (
              <Button asChild>
                <Link href="/settings/newspapers/new">עיתון חדש</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="newspaper-cards">
          {papers.map((p) => {
            const grid = gridOf(p);
            // What is still missing before anything can be sold in this paper.
            const missing = [
              ...(p._count.page_types === 0 ? ["סוגי עמודים"] : []),
              ...(p._count.ad_shapes === 0 ? ["צורות פרסום"] : []),
              ...(p._count.price_rules === 0 ? ["מחירון"] : []),
              ...(!hasSchedule(p.publication_days) ? ["ימי הדפסה"] : []),
            ];
            return (
              <article
                key={p.id}
                data-testid={`newspaper-card-${p.id}`}
                className="flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 transition hover:border-brand-gold"
              >
                <div className="flex gap-4 p-5">
                  <PageThumb
                    columns={grid?.columns ?? 0}
                    ratio={grid ? grid.pageWidthMm / grid.pageHeightMm : 0.7}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-xl font-semibold">
                      <Link href={`/settings/newspapers/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-sm text-on-surface-variant">
                      <Ltr>{PAGE_SIZE_LABELS[p.page_size as PageSizeKey] ?? p.page_size}</Ltr>
                      {grid ? (
                        <>
                          {" · "}
                          <Ltr>{gridLabel(p)}</Ltr>
                        </>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {hasSchedule(p.publication_days)
                        ? `יוצא ב${formatDays(p.publication_days)}`
                        : "לא הוגדרו ימי הדפסה"}
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-3 border-y border-outline-variant text-center text-xs text-on-surface-variant">
                  <div className="p-3">
                    <dd className="font-serif text-lg font-semibold text-on-surface">
                      <Ltr>{p._count.page_types}</Ltr>
                    </dd>
                    <dt>סוגי עמודים</dt>
                  </div>
                  <div className="border-x border-outline-variant p-3">
                    <dd className="font-serif text-lg font-semibold text-on-surface">
                      <Ltr>{p._count.ad_shapes}</Ltr>
                    </dd>
                    <dt>צורות פרסום</dt>
                  </div>
                  <div className="p-3">
                    <dd className="font-serif text-lg font-semibold text-on-surface">
                      <Ltr>{toMegabytes(p.max_ad_file_size)}MB</Ltr>
                    </dd>
                    <dt>קובץ מקסימלי</dt>
                  </div>
                </dl>

                <div className="flex flex-1 flex-wrap items-center justify-between gap-2 p-3">
                  {missing.length > 0 ? (
                    <span className="rounded-full bg-status-warning-bg px-2.5 py-0.5 text-xs text-status-warning-fg">
                      חסר: {missing.join(", ")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-status-success-bg px-2.5 py-0.5 text-xs text-status-success-fg">
                      מוכן למכירה
                    </span>
                  )}
                  <div className="flex gap-1">
                    {mayEdit ? <DuplicateNewspaper id={p.id} name={p.name} /> : null}
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/settings/newspapers/${p.id}`}>הגדרות</Link>
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {matched.length > 0 ? (
        <ListPager prefix="" params={list} total={matched.length} baseHref="/settings/newspapers" />
      ) : null}
    </>
  );
}

/** The newspaper's page division, or a dash when its page size cannot resolve. */
/** The column count is the unit ads are sold in; the centimetres make it real. */
function gridLabel(paper: Parameters<typeof gridOf>[0]) {
  const grid = gridOf(paper);
  if (!grid) return "—";
  return `${grid.columns} עמ׳ · ${formatCm(grid.columnWidthMm)} ס״מ`;
}

/**
 * A small picture of the page: its proportions and its columns, so two
 * newspapers can be told apart at a glance before reading a number.
 */
function PageThumb({ columns, ratio }: { columns: number; ratio: number }) {
  const height = 72;
  const width = Math.max(36, Math.min(64, Math.round(height * ratio)));
  return (
    <div
      aria-hidden
      className="flex shrink-0 gap-[2px] rounded-sm border border-outline-variant bg-surface-container-low p-1"
      style={{ width, height }}
    >
      {Array.from({ length: Math.min(columns, 12) }, (_, i) => (
        <span key={i} className="flex-1 rounded-[1px] bg-primary/15" />
      ))}
    </div>
  );
}
