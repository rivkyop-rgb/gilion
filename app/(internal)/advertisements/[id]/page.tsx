import type { Metadata } from "next";
import { RecordHistory } from "@/components/record-history";
import { notFound } from "next/navigation";
import { AlertTriangle, Download, FileText } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { getAdvertisement, linkablePublications, newspaperLimits } from "@/lib/data/advertisements";
import { listCustomerOptions } from "@/lib/data/customers";
import { AD_FILE_TYPE_LABELS, formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { canRevert } from "@/lib/domain/ad-version";
import { placeabilityNote } from "@/lib/domain/ad-link";
import { PUBLICATION_STATUS_LABELS, type PublicationStatus } from "@/lib/domain/publication-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { PUBLICATION_TONE } from "@/components/status-tone";
import { fileHref } from "../ad-card";
import { formatDateTime } from "../format";
import {
  ArchiveAd,
  CustomerAssigner,
  LinkPublication,
  ReplaceFile,
  RevertButton,
  UnlinkButton,
} from "./ad-controls";

export const metadata: Metadata = { title: "מודעה · Gilion" };

const DATE = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeZone: "Asia/Jerusalem",
});

export default async function AdvertisementPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  requireArea(ctx, "advertisements");

  const { id } = await params;
  const ad = await getAdvertisement(ctx.businessId, id);
  // notFound(), not a rendered not-found state: the refusal has to reach the
  // HTTP status as well, the way every other [id] screen answers (stage 01
  // DoD). Rendering the state returned 200 with a 404 page inside it, which
  // reads as "found" to anything that is not a pair of eyes.
  if (!ad) notFound();

  const mayWrite = ctx.role !== "accounting" && ctx.role !== "customer";
  const mayArchive = ctx.isSuperAdmin || ctx.role === "admin" || ctx.role === "sales";

  const [customers, papers, linkable] = await Promise.all([
    listCustomerOptions(ctx.businessId),
    newspaperLimits(ctx.businessId),
    ad.customer_id ? linkablePublications(ctx.businessId, ad.customer_id) : Promise.resolve([]),
  ]);

  // Replaced at least once: only then do "printed" and "first upload" differ.
  const replaced = ad.file_url !== ad.original_file_url;

  const note = placeabilityNote({
    id: ad.id,
    customerId: ad.customer_id,
    validationPassed: ad.validation_status === "passed",
    archived: ad.status === "archived",
  });

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4">
          <div className="flex h-[420px] items-center justify-center rounded-lg bg-surface-container">
            {ad.preview_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- see ad-card.tsx
              <img
                src={fileHref(ad.preview_url)}
                alt={ad.name}
                data-testid="ad-preview"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-on-surface-variant">
                <FileText className="size-12" />
                <p className="text-sm">אין תצוגה מקדימה לקובץ הזה</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" asChild>
              <a
                href={fileHref(ad.file_url)}
                target="_blank"
                rel="noreferrer"
                data-testid="download-current"
              >
                <Download className="size-4" />
                {replaced ? "הורדת הקובץ שיודפס" : "פתיחת הקובץ"}
              </a>
            </Button>
            {/* The first upload is kept untouched forever; it is only a
                different file once the ad has been replaced. Two buttons to
                the same bytes read as a riddle (the user, 03/11/2026). */}
            {replaced ? (
              <Button variant="ghost" size="sm" asChild>
                <a
                  href={fileHref(ad.original_file_url)}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="download-original"
                  title="הקובץ כפי שהועלה בפעם הראשונה, לפני ההחלפות"
                >
                  הקובץ שהועלה בהתחלה
                </a>
              </Button>
            ) : null}
          </div>
          {replaced ? (
            <p className="mt-2 text-xs text-on-surface-variant">
              המודעה הוחלפה. &quot;הקובץ שיודפס&quot; הוא הגרסה האחרונה; &quot;הקובץ שהועלה
              בהתחלה&quot; נשמר ליתר ביטחון.
            </p>
          ) : null}
        </section>

        <aside className="space-y-4">
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4">
            <h1 className="mb-1 break-all font-serif text-xl font-semibold">{ad.name}</h1>
            <p className="font-mono text-xs text-on-surface-variant">
              <Ltr>
                {AD_FILE_TYPE_LABELS[ad.file_type as AdFileType]} · {formatBytes(ad.file_size)}
              </Ltr>
            </p>
            <p className="mt-2 text-xs text-on-surface-variant">
              הועלה על ידי {ad.uploaded_by.name} · <Ltr>{formatDateTime(ad.uploaded_at)}</Ltr>
            </p>
            <div className="mt-2">
              <RecordHistory
                businessId={ctx.businessId}
                targets={[{ type: "Advertisement", ids: [ad.id] }]}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {ad.validation_status === "failed" ? (
                <Badge tone="error">דורש טיפול</Badge>
              ) : ad.validation_status === "pending" ? (
                <Badge tone="warning">בבדיקה…</Badge>
              ) : (
                <span title="המערכת בדקה אוטומטית שהקובץ נפתח, שהוא PDF / JPG / PNG ושגודלו בתוך המגבלה של העיתון. זו לא בדיקה של אדם.">
                  <Badge tone="success">נבדק אוטומטית: תקין</Badge>
                </span>
              )}
              {ad.status === "archived" ? <Badge tone="muted">בארכיון</Badge> : null}
            </div>

            {ad.validation_error ? (
              <p
                data-testid="ad-detail-error"
                className="mt-3 flex items-start gap-2 rounded-sm bg-status-error-bg px-2 py-1.5 text-xs text-status-error-fg"
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {ad.validation_error}
              </p>
            ) : null}

            {note ? (
              <p
                data-testid="placeability-note"
                className="mt-3 rounded-sm bg-status-warning-bg px-2 py-1.5 text-xs text-status-warning-fg"
              >
                {note}
              </p>
            ) : null}
          </div>

          {mayWrite ? (
            <div className="rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4">
              <CustomerAssigner
                adId={ad.id}
                current={ad.customer_id}
                locked={ad.publications.length > 0}
                customers={customers.map((c) => ({
                  value: c.id,
                  label: c.business_name,
                  hint: c.phone ?? undefined,
                }))}
              />
            </div>
          ) : null}

          {mayWrite ? (
            <div className="space-y-3 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4">
              <ReplaceFile adId={ad.id} newspapers={papers} />

              {/* One previous version only (US-005 AC-5). */}
              {canRevert({ previousFileUrl: ad.previous_file_url }) ? (
                <div
                  data-testid="previous-version"
                  className="rounded-sm border border-outline-variant p-3"
                >
                  <p className="mb-1 text-sm font-medium">גרסה קודמת</p>
                  <p className="mb-2 text-xs text-on-surface-variant">
                    עודכן לאחרונה <Ltr>{formatDateTime(ad.updated_at)}</Ltr>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={fileHref(ad.previous_file_url!)}
                        target="_blank"
                        rel="noreferrer"
                        data-testid="download-previous"
                      >
                        <Download className="size-4" />
                        צפייה
                      </a>
                    </Button>
                    <RevertButton adId={ad.id} />
                  </div>
                </div>
              ) : null}

              {mayArchive && ad.status !== "archived" ? (
                <ArchiveAd adId={ad.id} name={ad.name} />
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      <section className="mt-6 rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl font-semibold">פרסומים שמשתמשים במודעה</h2>
          {mayWrite ? (
            <LinkPublication
              adId={ad.id}
              blocked={note}
              options={linkable.map((p) => ({
                id: p.id,
                label: `${p.newspaper.name} · ${p.ad_shape.name}`,
                hint: `${DATE.format(p.publication_date)} · ${PUBLICATION_STATUS_LABELS[p.status as PublicationStatus]}`,
              }))}
            />
          ) : null}
        </div>

        {ad.publications.length === 0 ? (
          <p className="text-sm text-on-surface-variant" data-testid="no-publications">
            המודעה עדיין אינה משויכת לאף פרסום. אותה מודעה יכולה לשמש כמה פרסומים.
          </p>
        ) : (
          <table className="w-full text-sm" data-testid="ad-publications">
            <thead className="bg-surface-container">
              <tr>
                <th className="p-3 text-start font-semibold">עיתון</th>
                <th className="p-3 text-start font-semibold">תאריך</th>
                <th className="p-3 text-start font-semibold">סטטוס</th>
                <th className="p-3 text-start font-semibold" />
              </tr>
            </thead>
            <tbody>
              {ad.publications.map((p) => (
                <tr key={p.id} className="border-t border-outline-variant">
                  <td className="p-3">{p.newspaper.name}</td>
                  <td className="p-3">
                    <Ltr>{DATE.format(p.publication_date)}</Ltr>
                  </td>
                  <td className="p-3">
                    <Badge tone={PUBLICATION_TONE[p.status as PublicationStatus]}>
                      {PUBLICATION_STATUS_LABELS[p.status as PublicationStatus]}
                    </Badge>
                  </td>
                  <td className="p-3 text-end">
                    {mayWrite ? <UnlinkButton publicationId={p.id} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
