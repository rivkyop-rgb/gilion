import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Circle, CircleDot, XCircle } from "lucide-react";

import { getCustomerScope } from "@/lib/auth/portal";
import { portalFormOptions, portalRequest } from "@/lib/data/portal";
import {
  canCancelOwnRequest,
  groupRequestItems,
  requestTimeline,
} from "@/lib/domain/portal-request";
import { AdThumb } from "@/components/ads/ad-preview";
import type { OrderStatus } from "@/lib/domain/order-status";
import { formatBytes, type AdFileType } from "@/lib/domain/ad-file";
import { cn } from "@/lib/utils";
import {
  formatPortalDate,
  formatPortalDay,
  formatPublicationDay,
  Ltr,
  PortalStatusBadge,
  RejectionReason,
  RequestPrice,
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

  const papers = await portalFormOptions(scope);
  const gridOf = new Map(papers.map((p) => [p.id, p.grid]));
  const status = request.status as OrderStatus;
  const groups = groupRequestItems(request.items);
  const papersNamed = [...new Set(request.items.map((i) => i.newspaper.name))];

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
            <h1 className="font-serif text-2xl font-semibold">{papersNamed.join(" · ")}</h1>
            <p className="text-sm text-on-surface-variant">
              בקשה <Ltr>{requestNumber(request.number)}</Ltr> · נשלחה{" "}
              <Ltr>{formatPortalDate(request.created_at)}</Ltr>
            </p>
          </div>
          <PortalStatusBadge status={status} />
        </header>

        <RejectionReason status={status} reason={request.rejection_reason} />

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm" data-testid="request-publication-count">
            {request.items.length === 1 ? "פרסום אחד" : `${request.items.length} פרסומים`}
          </p>
          <div className="text-end">
            <RequestPrice order={request} />
            {status === "pending_approval" ? (
              <p className="text-xs text-on-surface-variant">
                המחיר נקבע סופית כשהעיתון מאשר את הבקשה.
              </p>
            ) : null}
          </div>
        </div>

        {/* The request as the customer built it: one block per size, paper
            and file, with its dates (backlog 26). */}
        <ul className="space-y-4" data-testid="request-lines">
          {groups.map(({ first, dates }) => (
            <li
              key={`${first.newspaper.id}-${first.ad_shape.id}-${first.advertisement?.id ?? ""}`}
              data-testid="request-line-view"
              className="flex flex-wrap gap-4 rounded-lg border border-outline-variant p-4"
            >
              {first.advertisement ? (
                first.advertisement.preview_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/files/${first.advertisement.preview_url}`}
                    alt={`תצוגה מקדימה של ${first.advertisement.name}`}
                    data-testid="request-ad-preview"
                    className="h-40 w-auto rounded-sm border border-outline-variant bg-surface-container object-contain"
                  />
                ) : (
                  <AdThumb
                    ad={{
                      name: first.advertisement.name,
                      fileType: first.advertisement.file_type as AdFileType,
                      previewUrl: null,
                    }}
                    className="size-40"
                  />
                )
              ) : null}
              <div className="min-w-0 flex-1 space-y-2 text-sm">
                <p className="font-semibold">{first.newspaper.name}</p>
                <ShapeLabel shape={first.ad_shape} grid={gridOf.get(first.newspaper.id) ?? null} />
                <p data-testid="request-date">
                  {dates.length === 1
                    ? formatPublicationDay(dates[0]!)
                    : dates.map((d) => formatPortalDay(d)).join(" · ")}
                </p>
                {first.advertisement ? (
                  <p className="text-xs text-on-surface-variant">
                    {first.advertisement.name} ·{" "}
                    <Ltr>{formatBytes(first.advertisement.file_size)}</Ltr>
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

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

        {canCancelOwnRequest(status) ? (
          <footer className="border-t border-outline-variant pt-6">
            <CancelRequest id={request.id} />
          </footer>
        ) : null}
      </article>
    </div>
  );
}
