/**
 * The link a designer gets to an issue's files (03/11/2026).
 *
 * Signed, not stored — the same scheme as the tear-sheet link: an HMAC of the
 * issue id under AUTH_SECRET. It opens that one issue's package and nothing
 * else; changing the id breaks the signature.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return value;
}

export function layoutPackageToken(issueId: string): string {
  return createHmac("sha256", secret())
    .update(`layout-package:${issueId}`)
    .digest("base64url")
    .slice(0, 32);
}

export function verifyLayoutPackageToken(issueId: string, token: string): boolean {
  const expected = Buffer.from(layoutPackageToken(issueId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The share page's path; the caller prefixes the public origin. */
export function layoutPackagePath(issueId: string): string {
  return `/api/layout-package/${issueId}/${layoutPackageToken(issueId)}`;
}
