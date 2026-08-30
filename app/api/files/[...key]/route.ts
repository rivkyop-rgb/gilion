/**
 * The single door to every stored file (conventions.md §5, FR-15).
 *
 * No object URL is ever rendered into HTML or returned in a payload. A browser
 * asks here, this route checks the tenant, the role and the ownership, and only
 * then redirects to a presigned URL that expires in five minutes.
 *
 * Everything it refuses, it refuses as 404 and never 403: a "forbidden" would
 * confirm that the file exists in someone else's business.
 */
import { NextResponse } from "next/server";

import { getTenantContext, canReadArea } from "@/lib/auth/tenant";
import { getAdvertisement } from "@/lib/data/advertisements";
import { businessOfKey, presignedGetUrl } from "@/lib/storage/minio";

const NOT_FOUND = new NextResponse("not found", { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = segments.join("/");

  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    return NOT_FOUND;
  }

  // FR-8: accounting has no operational need for files, so it has none here
  // either — the matrix is the same one the sidebar and the actions read.
  if (!canReadArea(ctx, "advertisements")) return NOT_FOUND;

  // First line: the key itself names a business. Comparing it to the session
  // costs nothing and stops a cross-tenant key before any lookup happens.
  if (businessOfKey(key) !== ctx.businessId) return NOT_FOUND;

  // Second line: the key must belong to a row this tenant can actually see,
  // and the row must be the one that owns this exact object. A guessed adId
  // under the right business id gets no further than this.
  const adId = adIdFromKey(key);
  if (!adId) return NOT_FOUND;

  const ad = await getAdvertisement(ctx.businessId, adId);
  if (!ad) return NOT_FOUND;

  const owned = [ad.file_url, ad.original_file_url, ad.previous_file_url, ad.preview_url];
  if (!owned.includes(key)) return NOT_FOUND;

  const url = await presignedGetUrl(key, ad.name);
  // The redirect must not be cached: the URL behind it dies in five minutes,
  // and a cached 307 would keep sending the browser to a dead link.
  return NextResponse.redirect(url, {
    status: 307,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

/** `{businessId}/ads/{adId}/{file}.{ext}` — anything else is not a file key. */
function adIdFromKey(key: string): string | null {
  const parts = key.split("/");
  return parts.length === 4 && parts[1] === "ads" ? (parts[2] ?? null) : null;
}
