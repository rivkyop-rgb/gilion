import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { getTenantContext, requireArea } from "@/lib/auth/tenant";
import { listAdvertisements, newspaperLimits } from "@/lib/data/advertisements";
import { listCustomerOptions } from "@/lib/data/customers";
import {
  AD_FILE_TYPES,
  AD_FILE_TYPE_LABELS,
  formatBytes,
  type AdFileType,
} from "@/lib/domain/ad-file";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Ltr } from "@/components/ui/ltr";
import { EmptyState } from "@/components/states";
import { cn } from "@/lib/utils";
import { AdCard, type AdCardModel } from "../ad-card";
import { UploadPanel } from "../upload-panel";
import { relativeTime } from "../format";

export const metadata: Metadata = { title: "מודעות · Gilion" };

const AD_STATUS_LABELS: Record<string, string> = {
  valid: "תקין",
  invalid: "דורש טיפול",
  archived: "בארכיון",
};

type Search = {
  customer?: string;
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  unassigned?: string;
  view?: string;
};

export default async function AdvertisementsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await getTenantContext();
  requireArea(ctx, "advertisements");

  const {
    customer = "all",
    status = "all",
    type = "all",
    from = "",
    to = "",
    unassigned = "",
    view = "grid",
  } = await searchParams;

  const unassignedOnly = unassigned === "1";

  const [rows, papers, customers] = await Promise.all([
    listAdvertisements(ctx.businessId, {
      customerId: customer,
      status,
      fileType: type,
      from,
      to,
      unassigned: unassignedOnly,
    }),
    newspaperLimits(ctx.businessId),
    listCustomerOptions(ctx.businessId),
  ]);

  const model: AdCardModel[] = rows.map((ad) => ({
    id: ad.id,
    name: ad.name,
    fileType: ad.file_type as AdFileType,
    fileSize: ad.file_size,
    previewUrl: ad.preview_url,
    fileUrl: ad.file_url,
    status: ad.status as AdCardModel["status"],
    validationStatus: ad.validation_status as AdCardModel["validationStatus"],
    validationError: ad.validation_error,
    customerLabel: ad.customer ? ad.customer.business_name : null,
    customerId: ad.customer?.id ?? null,
    uploadedBy: ad.uploaded_by.name,
    uploadedAt: ad.uploaded_at,
    publicationCount: ad._count.publications,
  }));

  // The design's two sections. "Requires attention" first, because a file that
  // will not print is the only thing on this screen with a deadline.
  const needsAttention = model.filter((a) => a.validationStatus === "failed");
  const rest = model.filter((a) => a.validationStatus !== "failed");

  const hrefWith = (patch: Partial<Search>) => {
    const q = new URLSearchParams();
    const merged: Search = { customer, status, type, from, to, unassigned, view, ...patch };
    for (const [key, value] of Object.entries(merged)) {
      if (value && value !== "all" && !(key === "view" && value === "grid")) q.set(key, value);
    }
    const query = q.toString();
    return query ? `/advertisements?${query}` : "/advertisements";
  };

  const mayWrite = ctx.role !== "accounting";

  return (
    <>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title font-serif text-headline-lg font-semibold">
            ניהול קבצים ומודעות
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            הגודל המותר נקבע לכל עיתון בנפרד בהגדרות. מודעה ללא לקוח, או שלא עברה בדיקה, אינה זמינה
            לשיבוץ.
          </p>
        </div>
        {mayWrite ? (
          <UploadPanel
            newspapers={papers}
            customers={customers.map((c) => ({
              id: c.id,
              label: c.business_name,
              hint: c.phone ?? undefined,
            }))}
          />
        ) : null}
      </div>

      <div className="mt-6 mb-4 flex flex-wrap items-center gap-2">
        <Link href={hrefWith({ unassigned: unassignedOnly ? "" : "1", customer: "all" })}>
          <span
            data-testid="chip-unassigned"
            className={cn(
              "inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors",
              unassignedOnly
                ? "bg-primary text-on-primary"
                : "bg-surface-container-lowest text-on-surface-variant ring-1 ring-outline-variant hover:bg-surface-container",
            )}
          >
            ללא לקוח
          </span>
        </Link>

        <span className="ms-auto inline-flex overflow-hidden rounded-sm ring-1 ring-outline-variant">
          {(["grid", "list"] as const).map((v) => (
            <Link
              key={v}
              href={hrefWith({ view: v })}
              data-testid={`view-${v}`}
              className={cn(
                "px-3 py-1.5 text-sm",
                view === v ? "bg-primary text-on-primary" : "bg-surface-container-lowest",
              )}
            >
              {v === "grid" ? "גריד" : "רשימה"}
            </Link>
          ))}
        </span>
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="view" value={view} />
        <input type="hidden" name="unassigned" value={unassigned} />
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="customer">
            לקוח
          </label>
          <div className="w-56">
            <Combobox
              id="customer"
              name="customer"
              testId="filter-customer"
              options={customers.map((c) => ({
                value: c.id,
                label: c.business_name,
                hint: c.phone ?? undefined,
              }))}
              // "" is "all": the data layer ignores an empty customer id.
              defaultValue={customer === "all" ? "" : customer}
              placeholder="כל הלקוחות"
              emptyText="אין לקוח בשם הזה"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="status">
            סטטוס
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            data-testid="filter-status"
            className="h-10 rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
          >
            <option value="all">כל הסטטוסים</option>
            {Object.entries(AD_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="type">
            סוג קובץ
          </label>
          <select
            id="type"
            name="type"
            defaultValue={type}
            data-testid="filter-type"
            className="h-10 rounded-lg border border-outline-variant bg-surface-container px-3 text-start text-sm"
          >
            <option value="all">כל הסוגים</option>
            {AD_FILE_TYPES.map((t) => (
              <option key={t} value={t}>
                {AD_FILE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="from">
            מתאריך
          </label>
          <Input id="from" name="from" type="date" dir="ltr" defaultValue={from} className="w-40" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-on-surface-variant" htmlFor="to">
            עד תאריך
          </label>
          <Input id="to" name="to" type="date" dir="ltr" defaultValue={to} className="w-40" />
        </div>

        <Button type="submit" variant="secondary" data-testid="apply-filters">
          סינון
        </Button>
      </form>

      {model.length === 0 ? (
        <EmptyState
          title="אין עדיין קבצי מודעות"
          body="כל קובץ שיועלה יופיע כאן — עם הלקוח שלו, גודלו ותוצאת הבדיקה."
        />
      ) : (
        <div className="space-y-8">
          {needsAttention.length > 0 ? (
            <section data-testid="section-attention">
              <h2 className="mb-3 flex items-center gap-2 font-serif text-xl font-semibold text-status-error-fg">
                <AlertTriangle className="size-5" />
                דורשים טיפול
                <Badge tone="error">{needsAttention.length}</Badge>
              </h2>
              <AdCollection ads={needsAttention} view={view} />
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section data-testid="section-recent">
              <h2 className="mb-3 font-serif text-xl font-semibold">קבצים אחרונים</h2>
              <AdCollection ads={rest} view={view} />
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

function AdCollection({ ads, view }: { ads: AdCardModel[]; view: string }) {
  if (view === "list") return <AdTable ads={ads} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ads.map((ad) => (
        <AdCard key={ad.id} ad={ad} />
      ))}
    </div>
  );
}

function AdTable({ ads }: { ads: AdCardModel[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-outline-variant bg-surface-container-lowest shadow-elevation-1">
      <table className="w-full text-sm" data-testid="ads-table">
        <thead className="bg-surface-container">
          <tr>
            <th className="p-3 text-start font-semibold">שם קובץ</th>
            <th className="p-3 text-start font-semibold">לקוח</th>
            <th className="p-3 text-start font-semibold">סוג</th>
            <th className="p-3 text-start font-semibold">גודל</th>
            <th className="p-3 text-start font-semibold">סטטוס</th>
            <th className="p-3 text-start font-semibold">הועלה</th>
          </tr>
        </thead>
        <tbody>
          {ads.map((ad) => (
            <tr
              key={ad.id}
              className="border-t border-outline-variant hover:bg-surface-container-low"
            >
              <td className="p-3">
                <Link
                  href={`/advertisements/${ad.id}`}
                  data-testid={`ad-row-${ad.id}`}
                  className="underline"
                >
                  {ad.name}
                </Link>
              </td>
              <td className="p-3">
                {ad.customerId ? (
                  <Link
                    href={`/customers/${ad.customerId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {ad.customerLabel}
                  </Link>
                ) : (
                  <Badge tone="warning">ללא לקוח</Badge>
                )}
              </td>
              <td className="p-3 font-mono text-xs">
                <Ltr>{AD_FILE_TYPE_LABELS[ad.fileType]}</Ltr>
              </td>
              <td className="p-3 font-mono text-xs">
                <Ltr>{formatBytes(ad.fileSize)}</Ltr>
              </td>
              <td className="p-3">
                <Badge
                  tone={
                    ad.validationStatus === "failed"
                      ? "error"
                      : ad.status === "archived"
                        ? "muted"
                        : "success"
                  }
                >
                  {ad.validationStatus === "failed" ? "דורש טיפול" : AD_STATUS_LABELS[ad.status]}
                </Badge>
              </td>
              <td className="p-3 text-xs text-on-surface-variant">
                {ad.uploadedBy} · {relativeTime(ad.uploadedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
