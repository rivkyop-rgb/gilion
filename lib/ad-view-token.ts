/**
 * The link a customer gets to see their own file in the space they bought
 * (03/11/2026: the "file does not fit" message). Signed, not stored — the
 * same scheme as the designer's and the tear-sheet links: an HMAC of the
 * publication id under AUTH_SECRET. It opens that one publication and nothing
 * else.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

export function adViewToken(publicationId: string): string {
  return createHmac("sha256", secret())
    .update(`ad-view:${publicationId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyAdViewToken(publicationId: string, token: string): boolean {
  const expected = Buffer.from(adViewToken(publicationId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The page's path; the caller prefixes the origin the person reached us at. */
export function adViewPath(publicationId: string): string {
  return `/api/ad-view/${publicationId}/${adViewToken(publicationId)}`;
}
