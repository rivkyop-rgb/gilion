import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";

import { getCustomerScope } from "@/lib/auth/portal";
import { portalFormOptions, portalRequest } from "@/lib/data/portal";
import { canCancelOwnRequest, requestTimeline } from "@/lib/domain/portal-request";
import type { OrderStatus } from "@/lib/domain/order-status";
import { formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { cn } from "@/lib/utils";
import {
  formatPortalDate,
  formatPublicationDay,
  Ltr,
  PortalStatusBadge,
  RejectionReason,
  requestNumber,
  ShapeLabel,
} from "@/components/portal/request-parts";
import { CancelRequest } from "./cancel-request";

export const metadata: Metadata = { title: "פרטי בקשה · Gilion" };

export default async function PortalRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const scope = await getCustomerScope();
  const { id } = await params;
  const { sent } = await searchParams;

  // Someone else's id finds nothing, exactly like a typo — 404, not 403
  // (rule 10): a "forbidden" would confirm the request exists.
  const request = await portalRequest(scope, id);
  if (!request) notFound();

  const item = request.items[0];
  const papers = await portalFormOptions(scope);
  const grid = papers.find((p) => p.id === item?.newspaper.id)?.grid ?? null;
  const status = request.status as OrderStatus;
  const ad = request.advertisement;

  return (
    <div className="space-y-4">
      <Link href="/portal" className="inline-flex items-center gap-1 text-sm text-primary">
        <ArrowRight className="size-4" />
        לבקשות שלי
      </Link>

      {sent ? (
        <p
          data-testid="request-sent"
          className="rounded-lg bg-status-success-bg px-4 py-3 text-sm text-status-success-fg"
        >
          הבקשה נשלחה ומחכה לאישור העיתון. פרסום ייווצר רק לאחר האישור.
        </p>
      ) : null}

      <article className="space-y-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold">{item?.newspaper.name}</h1>
            <p className="text-sm text-on-surface-variant">
              בקשה <Ltr>{requestNumber(request.number)}</Ltr> · נשלחה{" "}
              <Ltr>{formatPortalDate(request.created_at)}</Ltr>
            </p>
          </div>
          <PortalStatusBadge status={status} />
        </header>

        <RejectionReason status={status} reason={request.rejection_reason} />

        {item ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-on-surface-variant">תאריך פרסום</dt>
              <dd data-testid="request-date">{formatPublicationDay(item.publication_date)}</dd>
            </div>
            <div>
              <dt className="text-xs text-on-surface-variant">גודל</dt>
              <dd>
                <ShapeLabel shape={item.ad_shape} grid={grid} />
              </dd>
            </div>
          </dl>
        ) : null}

        <section>
          <h2 className="mb-3 text-sm font-semibold">מצב הבקשה</h2>
          <ol className="space-y-3" data-testid="request-timeline">
            {requestTimeline(request as Parameters<typeof requestTimeline>[0]).map((step) => (
              <li key={step.key} className="flex items-center gap-3" data-state={step.state}>
                {step.state === "done" ? (
                  <CheckCircle2 className="size-5 text-status-success-fg" aria-hidden />
                ) : step.state === "stopped" ? (
                  <XCircle className="size-5 text-error" aria-hidden />
                ) : step.state === "current" ? (
                  <CircleDot className="size-5 text-status-warning-fg" aria-hidden />
                ) : (
                  <Circle className="size-5 text-outline-variant" aria-hidden />
                )}
                <span className={cn(step.state === "upcoming" && "text-on-surface-variant")}>
                  {step.label}
                </span>
                {step.at ? (
                  <span className="text-xs text-on-surface-variant">
                    <Ltr>{formatPortalDate(step.at)}</Ltr>
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        {ad ? (
          <section>
            <h2 className="mb-3 text-sm font-semibold">המודעה</h2>
            <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
              {ad.preview_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/files/${ad.preview_url}`}
                  alt={`תצוגה מקדימה של ${ad.name}`}
                  data-testid="request-ad-preview"
                  className="mx-auto max-h-[480px] w-auto object-contain"
                />
              ) : (
                <p className="p-6 text-center text-sm text-on-surface-variant">
                  אין תצוגה מקדימה לקובץ הזה
                </p>
              )}
            </div>
            <p className="mt-2 text-xs text-on-surface-variant">
              {ad.name} · <Ltr>{formatBytes(ad.file_size)}</Ltr> ·{" "}
              {(ad.file_type as AdFileType).toUpperCase()}
            </p>
          </section>
        ) : null}

        {canCancelOwnRequest(status) ? (
          <footer className="border-t border-outline-variant pt-6">
            <CancelRequest id={request.id} />
          </footer>
        ) : null}
      </article>
    </div>
  );
}
