/**
 * The link a customer gets to one tear sheet (14/10/2026).
 *
 * Signed, not stored: an HMAC of the publication id under AUTH_SECRET. The
 * link works without a login — the customer may have no portal account — and
 * cannot be forged or walked: changing the id breaks the signature, so a link
 * to one tear sheet opens that one and nothing else.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

export function tearSheetToken(publicationId: string): string {
  return createHmac("sha256", secret())
    .update(`tear-sheet:${publicationId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyTearSheetToken(publicationId: string, token: string): boolean {
  const expected = Buffer.from(tearSheetToken(publicationId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The path of one tear sheet; the caller prefixes the public origin. */
export function tearSheetPath(publicationId: string): string {
  return `/api/tear-sheet/${publicationId}/${tearSheetToken(publicationId)}`;
}
