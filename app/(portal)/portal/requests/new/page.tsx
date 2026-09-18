import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getCustomerScope } from "@/lib/auth/portal";
import { portalAdLibrary, portalFormOptions, type PortalFormNewspaper } from "@/lib/data/portal";
import { RequestForm } from "./request-form";

export const metadata: Metadata = { title: "בקשת פרסום חדשה · Gilion" };

/**
 * Page types are how the SERVER files the request (pickPageType) — the
 * newspaper's internal vocabulary. The browser gets the size and its estimate,
 * and not the page type or the per-page-type price list behind it.
 */
function forBrowser(paper: PortalFormNewspaper): PortalFormNewspaper {
  return { ...paper, shapes: paper.shapes.map((s) => ({ ...s, pageTypes: [] })) };
}

export default async function NewRequestPage() {
  const scope = await getCustomerScope();
  const [newspapers, library] = await Promise.all([
    portalFormOptions(scope),
    portalAdLibrary(scope),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-primary">
        <ArrowRight className="size-4" />
        לבקשות שלי
      </Link>
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="bg-linear-to-b from-status-info-bg/60 to-surface-container-lowest px-8 pt-8 pb-4">
          <h1 className="mb-2 font-serif text-3xl font-semibold">בקשת פרסום חדשה</h1>
          <p className="text-on-surface-variant">
            ממלאים עיתון, תאריך, גודל וקובץ — והבקשה עוברת לאישור העיתון.
          </p>
        </div>
        <div className="px-8 pb-8 pt-4">
          {newspapers.length === 0 ? (
            <p className="text-on-surface-variant">
              אין כרגע עיתונים שאפשר להזמין בהם פרסום. אפשר לפנות ישירות לעיתון.
            </p>
          ) : (
            <RequestForm
              newspapers={newspapers.map(forBrowser)}
              library={library.map((ad) => ({
                id: ad.id,
                name: ad.name,
                fileType: ad.file_type,
                fileSize: ad.file_size,
                previewUrl: ad.preview_url,
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}
