import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Send } from "lucide-react";

import { getCustomerScope } from "@/lib/auth/portal";
import { loadSettings } from "@/lib/data/business-settings";
import { portalFormOptions, portalRequests, publicationsAwaitingArtwork } from "@/lib/data/portal";
import { PublicationUpload } from "@/components/portal/publication-upload";
import { textFor } from "@/lib/domain/business-settings";
import type { OrderStatus } from "@/lib/domain/order-status";
import { todayIso } from "@/lib/domain/publication-days";
import { AdThumb } from "@/components/ads/ad-preview";
import { Button } from "@/components/ui/button";
import type { AdFileType } from "@/lib/domain/ad-file";
import {
  formatPublicationDay,
  Ltr,
  PortalStatusBadge,
  RejectionReason,
  RequestPrice,
  requestNumber,
  ShapeLabel,
} from "@/components/portal/request-parts";

export const metadata: Metadata = { title: "הבקשות שלי · Gilion" };

export default async function PortalHomePage() {
  const scope = await getCustomerScope();
  const today = new Date(`${todayIso()}T00:00:00Z`);
  const [requests, settings, papers, waiting] = await Promise.all([
    portalRequests(scope),
    loadSettings(scope.businessId),
    portalFormOptions(scope),
    publicationsAwaitingArtwork(scope, today),
  ]);
  const gridOf = new Map(papers.map((p) => [p.id, p.grid]));

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-outline-variant bg-linear-to-b from-status-info-bg/60 to-surface-container-lowest p-8">
        <h1 className="mb-2 font-serif text-3xl font-semibold">הבקשות שלי</h1>
        <p data-testid="portal-intro" className="mb-6 whitespace-pre-line text-on-surface-variant">
          {textFor("portal_intro", settings.texts)}
        </p>
        <Button asChild size="lg">
          <Link href="/portal/requests/new" data-testid="new-request">
            <Plus className="size-4" />
            בקשת פרסום חדשה
          </Link>
        </Button>
      </section>

      {/* Backlog 24: an order the office opened for this customer, still
          waiting for the file. First on the page, because it is the one thing
          here with a deadline. */}
      {waiting.length > 0 ? (
        <section
          data-testid="awaiting-artwork"
          className="rounded-xl border border-status-warning-fg/30 bg-status-warning-bg/40 p-6"
        >
          <h2 className="mb-1 font-serif text-xl font-semibold">מחכים למודעה ממך</h2>
          <p className="mb-4 text-sm text-on-surface-variant">
            פרסומים שהוזמנו ועדיין לא הגיע אליהם קובץ.
          </p>
          <ul className="divide-y divide-outline-variant">
            {waiting.map((p) => (
              <li
                key={p.id}
                data-testid="awaiting-row"
                data-publication-id={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="text-sm">
                  <p className="font-semibold">{p.newspaper.name}</p>
                  <p>{formatPublicationDay(p.publication_date)}</p>
                  <p className="text-on-surface-variant">
                    {p.ad_shape.name} · <Ltr>{requestNumber(p.order.number)}</Ltr>
                  </p>
                </div>
                <PublicationUpload publicationId={p.id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {requests.length === 0 ? (
        <section
          data-testid="portal-empty"
          className="flex flex-col items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-8 py-14 text-center"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-container">
            <Send className="size-6 text-primary" aria-hidden />
          </span>
          <p className="font-serif text-xl font-semibold">עדיין לא שלחת בקשות</p>
          <p className="text-sm text-on-surface-variant">
            בקשה חדשה לוקחת דקה: עיתון, תאריך, גודל וקובץ המודעה.
          </p>
          <Button asChild>
            <Link href="/portal/requests/new">בקשת פרסום חדשה</Link>
          </Button>
        </section>
      ) : (
        <ul className="space-y-4" data-testid="portal-requests">
          {requests.map((r) => {
            const item = r.items[0];
            return (
              <li key={r.id}>
                <Link
                  href={`/portal/requests/${r.id}`}
                  data-testid="request-card"
                  data-request-id={r.id}
                  className="block rounded-xl border border-outline-variant bg-surface-container-lowest p-5 transition-colors hover:border-outline"
                >
                  <div className="flex gap-4">
                    {r.advertisement ? (
                      <AdThumb
                        ad={{
                          name: r.advertisement.name,
                          fileType: r.advertisement.file_type as AdFileType,
                          previewUrl: r.advertisement.preview_url,
                        }}
                        className="size-20 shrink-0"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{item?.newspaper.name}</p>
                        <PortalStatusBadge status={r.status as OrderStatus} />
                      </div>
                      {item ? (
                        <>
                          <p className="text-sm">{formatPublicationDay(item.publication_date)}</p>
                          <p className="text-sm text-on-surface-variant">
                            <ShapeLabel
                              shape={item.ad_shape}
                              grid={gridOf.get(item.newspaper.id) ?? null}
                            />
                          </p>
                        </>
                      ) : null}
                      <p className="flex flex-wrap justify-between gap-2 text-xs text-on-surface-variant">
                        <Ltr>{requestNumber(r.number)}</Ltr>
                        <RequestPrice order={r} />
                      </p>
                    </div>
                  </div>
                  {r.status === "rejected" ? (
                    <div className="mt-4">
                      <RejectionReason status={r.status} reason={r.rejection_reason} />
                    </div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
