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
import { brandKeysFor, loginBrandKeys } from "@/lib/data/business-settings";
import { isBrandKey } from "@/lib/domain/business-settings";
import { businessOfKey, contentTypeOfKey, getObjectStream, statObject } from "@/lib/storage/minio";

const NOT_FOUND = new NextResponse("not found", { status: 404 });

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await params;
  const key = segments.join("/");

  let ctx;
  try {
    ctx = await getTenantContext();
  } catch {
    // No session. Exactly one thing is reachable here, and only when the
    // installation holds a single business: that business's brand assets, so
    // /login can show its logo. See loginBrandKeys() for why this is a hole
    // worth opening — a login-page logo is public by construction. Everything
    // else, including any other key under the same business, is still 404.
    if (isBrandKey(key) && (await loginBrandKeys()).includes(key)) {
      return serve(key, key.split("/").pop() ?? "brand");
    }
    return NOT_FOUND;
  }

  // First line, and it comes before every role check: the key itself names a
  // business. Comparing it to the session costs nothing and stops a
  // cross-tenant key before any lookup happens.
  if (businessOfKey(key) !== ctx.businessId) return NOT_FOUND;

  // Brand assets (stage 11) take a different door, and deliberately a wider
  // one. A logo is chrome: it is on the sidebar of every screen, so gating it
  // behind `advertisements` would blank it for accounting — FR-8 keeps that
  // role away from artwork, not from the header of the page it is looking at.
  // What still holds is the tenant check above and ownership below: the key
  // must be one this business currently points at, so a guessed brand key
  // under the right business id serves nothing.
  let fileName = "";
  if (isBrandKey(key)) {
    if (!(await brandKeysFor(ctx.businessId)).includes(key)) return NOT_FOUND;
    fileName = key.split("/").pop() ?? "brand";
  } else {
    // A portal customer reads the matrix as "none" for advertisements, and
    // still has to see their own artwork on their own requests (stage 09).
    // So they get a door of their own, narrower than staff's: the row must
    // name THEIR customer, not merely their business. Brand assets above stay
    // open to them — the portal wears the business's logo too.
    const isCustomer = ctx.role === "customer";
    // FR-8: accounting has no operational need for artwork, so it has none
    // here either — the matrix is the same one the sidebar and the actions read.
    if (!isCustomer && !canReadArea(ctx, "advertisements")) return NOT_FOUND;
    if (isCustomer && !ctx.customerId) return NOT_FOUND;

    // Second line: the key must belong to a row this tenant can actually see,
    // and the row must be the one that owns this exact object. A guessed adId
    // under the right business id gets no further than this.
    const adId = adIdFromKey(key);
    if (!adId) return NOT_FOUND;

    const ad = await getAdvertisement(ctx.businessId, adId);
    if (!ad) return NOT_FOUND;
    if (isCustomer && ad.customer_id !== ctx.customerId) return NOT_FOUND;

    const owned = [ad.file_url, ad.original_file_url, ad.previous_file_url, ad.preview_url];
    if (!owned.includes(key)) return NOT_FOUND;
    fileName = ad.name;
  }

  return serve(key, fileName);
}

/** Everything past the checks: the bytes, with the headers they go out under. */
async function serve(key: string, fileName: string) {
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
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      // A logo that renders as markup would run whatever survived sanitising.
      // It cannot, through <img>, but the header costs nothing and covers the
      // day someone opens the URL directly.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
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
