/**
 * The single door to every stored file (conventions.md §5, FR-15).
 *
 * No object URL is ever rendered into HTML or returned in a payload. A browser
 * asks here, this route checks the tenant, the role and the ownership, and only
 * then hands back the bytes.
 *
 * ── It streams; §5 says it redirects ─────────────────────────────────────────
 * A presigned URL names the host the SERVER knows MinIO by — `localhost:9100`
 * in this deployment — and the browser resolves `localhost` to the machine the
 * PERSON is at. Every preview in the product was therefore an empty box for
 * everyone except whoever was sitting at the server, with nothing in any log to
 * say so, because a failed `<img>` reports nothing. Streaming keeps the browser
 * on an origin it has already reached. What §5 exists to guarantee — that no
 * object URL is ever exposed — is stronger this way, not weaker.
 *
 * Everything it refuses, it refuses as 404 and never 403: a "forbidden" would
 * confirm that the file exists in someone else's business.
 */
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { getTenantContext, canReadArea } from "@/lib/auth/tenant";
import { getAdvertisement } from "@/lib/data/advertisements";
import { businessOfKey, contentTypeOfKey, getObjectStream, statObject } from "@/lib/storage/minio";

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

  let stream;
  try {
    stream = await getObjectStream(key);
  } catch {
    // The row says the object exists and the store disagrees. That is a 404 to
    // the browser like any other miss — there is nothing here to serve.
    return NOT_FOUND;
  }
  const stat = await statObject(key);

  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": contentTypeOfKey(key),
      // RFC 5987, so a Hebrew file name survives the round trip.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(ad.name)}`,
      // Private, because the answer depends on who asked: a shared cache must
      // never hand one business's artwork to another's browser.
      "Cache-Control": "private, max-age=300",
      ...(stat ? { "Content-Length": String(stat.size) } : {}),
    },
  });
}

/** `{businessId}/ads/{adId}/{file}.{ext}` — anything else is not a file key. */
function adIdFromKey(key: string): string | null {
  const parts = key.split("/");
  return parts.length === 4 && parts[1] === "ads" ? (parts[2] ?? null) : null;
}
