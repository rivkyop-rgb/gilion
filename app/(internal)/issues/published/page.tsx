import type { Metadata } from "next";
import Link from "next/link";
import { AutoSubmitForm } from "@/components/ui/auto-submit-form";
import { Archive, FileDown } from "lucide-react";

import { canReadArea, getTenantContext, requireArea } from "@/lib/auth/tenant";
import { publishedIssues } from "@/lib/data/issues";
import { listNewspapers } from "@/lib/data/newspapers";
import { ListPager } from "@/components/ui/list-toolbar";
import { baseHrefFor, clampPage, parseListParams, skipFor } from "@/lib/domain/list-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";

export const metadata: Metadata = { title: "גיליונות שפורסמו · Gilion" };

const DAY = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
const STAMP = new Intl.DateTimeFormat("he-IL", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jerusalem",
});
const ISO = /^\d{4}-\d{2}-\d{2}$/;

type Search = {
  from?: string;
  to?: string;
  newspaper?: string;
  customer?: string;
  page?: string;
  size?: string;
};

/**
 * The archive of printed issues (the user, 31/10/2026): found by date,
 * newspaper or an advertiser who appeared in them. The working list on
 * /issues holds only what is still being laid out.
 */
export default async function PublishedIssuesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "issues");
  const raw = await searchParams;
  const filters = {
    from: ISO.test(raw.from ?? "") ? raw.from! : "",
    to: ISO.test(raw.to ?? "") ? raw.to! : "",
    newspaperId: raw.newspaper ?? "",
    customer: (raw.customer ?? "").trim(),
  };
  const requested = parseListParams(raw);
  const papers = await listNewspapers(ctx.businessId);
  const first = await publishedIssues(ctx.businessId, filters, {
    skip: skipFor(requested),
    take: requested.size,
  });
  const list = clampPage(requested, first.total);
  const { rows, total } =
    list.page === requested.page
      ? first
      : await publishedIssues(ctx.businessId, filters, { skip: skipFor(list), take: list.size });
  const mayDownloadPdf = canReadArea(ctx, "pdf");
  const filtered = Boolean(filters.from || filters.to || filters.newspaperId || filters.customer);
  const base = baseHrefFor("/issues/published", {
    from: filters.from || undefined,
    to: filters.to || undefined,
    newspaper: filters.newspaperId || undefined,
    customer: filters.customer || undefined,
  });

  return (
    <>
      <nav className="mb-2 text-sm text-on-surface-variant">
        <Link href="/issues" className="hover:underline">
          גיליונות ושיבוץ
        </Link>{" "}
        / גיליונות שפורסמו
      </nav>
      <h1 className="mb-1 flex items-center gap-2 page-title font-serif text-headline-lg font-semibold">
        <Archive className="size-7" aria-hidden />
        גיליונות שפורסמו
      </h1>
      <p className="mb-4 text-sm text-on-surface-variant">
        כל גיליון שנסגר וירד לדפוס. אפשר לחפש לפי תאריך, עיתון או מפרסם שהופיע בגיליון.
      </p>

      <AutoSubmitForm
        liveText
        testId="published-filters"
        className="mb-4 grid gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-elevation-1 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      >
        <div>
          <Label htmlFor="from">מתאריך</Label>
          <Input id="from" name="from" type="date" dir="ltr" defaultValue={filters.from} />
        </div>
        <div>
          <Label htmlFor="to">עד תאריך</Label>
          <Input id="to" name="to" type="date" dir="ltr" defaultValue={filters.to} />
        </div>
        <div>
          <Label htmlFor="newspaper">עיתון</Label>
          <select
            id="newspaper"
            name="newspaper"
            defaultValue={filters.newspaperId}
            className="h-10 w-full rounded-lg border border-outline-variant bg-surface-container px-3 text-sm"
          >
            <option value="">כל העיתונים</option>
            {papers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="customer">מפרסם</Label>
          <Input
            id="customer"
            name="customer"
            placeholder="שם הלקוח"
            defaultValue={filters.customer}
            data-testid="published-customer"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit" className="sr-only">
            סינון
          </Button>
          {filtered ? (
            <Button asChild variant="ghost">
              <Link href="/issues/published">איפוס</Link>
            </Button>
          ) : null}
        </div>
      </AutoSubmitForm>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "אין גיליון שפורסם בסינון הזה" : "עוד לא נסגר אף גיליון"}
          body={
            filtered
              ? "אפשר להרחיב את טווח התאריכים או לנקות את הסינון."
              : 'גיליון מגיע לכאן ברגע שנסגר במסך "בדיקה וסגירה" וה־PDF הסופי שלו הופק.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
          <table className="w-full text-sm" data-testid="published-table">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">תאריך</th>
                <th className="p-3 text-start font-semibold">עיתון</th>
                <th className="p-3 text-start font-semibold">עמודים</th>
                <th className="p-3 text-start font-semibold">מודעות</th>
                <th className="p-3 text-start font-semibold">נסגר</th>
                <th className="p-3 text-start font-semibold">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((issue) => (
                <tr
                  key={issue.id}
                  data-testid={`issue-card-${issue.id}`}
                  className="border-t border-outline-variant"
                >
                  <td className="p-3 font-medium">
                    <Ltr>{DAY.format(issue.issue_date)}</Ltr>
                  </td>
                  <td className="p-3">{issue.newspaper.name}</td>
                  <td className="p-3">
                    <Ltr>{issue._count.pages}</Ltr>
                  </td>
                  <td className="p-3">
                    <Ltr>{issue._count.placements}</Ltr>
                  </td>
                  <td className="p-3 text-on-surface-variant">
                    {issue.closed_at ? <Ltr>{STAMP.format(issue.closed_at)}</Ltr> : "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1 whitespace-nowrap">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/issues/${issue.id}/board`}>צפייה בגיליון</Link>
                      </Button>
                      {issue.final_pdf_url && mayDownloadPdf ? (
                        <Button asChild size="sm" variant="ghost" data-testid="download-final-pdf">
                          <a href={`/api/issues/${issue.id}/pdf?type=final`}>
                            <FileDown className="size-4" />
                            PDF סופי
                          </a>
                        </Button>
                      ) : null}
                      {issue.press_pdf_url && mayDownloadPdf ? (
                        <Button asChild size="sm" variant="ghost" data-testid="download-press-pdf">
                          <a href={`/api/issues/${issue.id}/pdf?type=press`}>
                            <FileDown className="size-4" />
                            PDF לדפוס
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > 0 ? <ListPager prefix="" params={list} total={total} baseHref={base} /> : null}
    </>
  );
}
