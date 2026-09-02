import type { Metadata } from "next";
import Link from "next/link";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { gridOf, listNewspapers, getNewspaper } from "@/lib/data/newspapers";
import { findIssueByDate, plannedCountFor } from "@/lib/data/issues";
import { EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { NewIssueForm, type NewspaperOption } from "./new-issue-form";

export const metadata: Metadata = { title: "פתיחת גיליון · Gilion" };

export default async function NewIssuePage() {
  const ctx = await getTenantContext();
  requireArea(ctx, "issues", "write");

  const papers = await listNewspapers(ctx.businessId);

  // A newspaper with no page types has nothing to build an issue out of. It is
  // still listed, with its reason, rather than quietly producing an empty page
  // picker — the same failure the order builder already learned to explain.
  const options: NewspaperOption[] = await Promise.all(
    papers.map(async (paper) => {
      const full = await getNewspaper(ctx.businessId, paper.id);
      const grid = full ? gridOf(full) : null;
      return {
        id: paper.id,
        name: paper.name,
        columns: grid?.columns ?? 0,
        rows: grid?.rows ?? 0,
        pageTypes: (full?.page_types ?? []).map((pt) => ({ id: pt.id, name: pt.name })),
      };
    }),
  );

  if (options.length === 0) {
    return (
      <EmptyState
        title="אין עדיין עיתונים"
        body="גיליון נפתח לעיתון קיים. יש להגדיר עיתון אחד לפחות, עם סוגי עמודים, לפני פתיחת גיליון."
        action={
          <Button asChild>
            <Link href="/settings/newspapers">להגדרות העיתונים</Link>
          </Button>
        }
      />
    );
  }

  return (
    <>
      <h1 className="mb-1 font-serif text-3xl font-semibold">פתיחת גיליון חדש</h1>
      <p className="mb-4 text-sm text-on-surface-variant">
        בחרי עיתון ותאריך, והרכיבי את העמודים. חלוקת העמוד של העיתון מצולמת אל הגיליון ברגע הפתיחה,
        ומאותו רגע שינוי בהגדרות העיתון אינו משפיע עליו.
      </p>
      <NewIssueForm newspapers={options} preview={previewForDate} />
    </>
  );
}

/**
 * How many publications already wait for a date — the live preview line.
 *
 * A Server Action rather than loading every date up front: the answer depends
 * on a date nobody has chosen yet, and fetching a year of counts to answer one
 * question is the wrong trade.
 */
async function previewForDate(newspaperId: string, date: string) {
  "use server";
  const ctx = await getTenantContext();
  requireArea(ctx, "issues", "write");
  if (!newspaperId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { planned: 0, exists: false };

  const issueDate = new Date(date);
  const [planned, existing] = await Promise.all([
    plannedCountFor(ctx.businessId, newspaperId, issueDate),
    findIssueByDate(ctx.businessId, newspaperId, issueDate),
  ]);

  return { planned, exists: existing !== null };
}
