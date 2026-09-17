import { headers } from "next/headers";
import { portalPath } from "@/lib/domain/portal-link";

/**
 * The full portal link, as the person reading it will open it.
 *
 * Built from the request's own host rather than a configured base URL: the
 * link is copied by someone who reached the app at that address, so it is the
 * address that works for them — the demo on 169.58.56.195 and a real domain
 * alike, with nothing to keep in sync.
 */
export async function portalUrl(slug: string): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}${portalPath(slug)}`;
}
