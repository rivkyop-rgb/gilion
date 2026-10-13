import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authEdge } from "@/lib/auth/edge";

/**
 * Route gating (FR-2, FR-9).
 *
 * This is the first line only. Every internal layout and Server Action repeats
 * the check, because middleware runs on the edge with a matcher that is easy to
 * get wrong, and a tenancy hole must not depend on one regex being right.
 */
const gate = authEdge((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const path = nextUrl.pathname;

  const isAuthRoute = path === "/login";
  const isPicker = path === "/select-business";
  const isPortal = path === "/portal" || path.startsWith("/portal/");
  // /p/<slug> is a business's own portal door (backlog 21) — a sign-in page,
  // so it belongs with /portal/login in every rule below.
  const isPortalLogin = path === "/portal/login" || /^\/p\/[^/]+\/?$/.test(path);

  // A tear sheet's signed link (14/10/2026) — opened from a customer's mail,
  // with or without any session. The signature is checked by the route itself.
  if (path.startsWith("/api/tear-sheet/")) return NextResponse.next();

  if (!session?.user) {
    if (isAuthRoute || isPortalLogin) return NextResponse.next();
    // A business's logo on its own portal door, before sign-in. The route
    // decides which keys that covers — this only lets the request reach it.
    if (path.startsWith("/api/files/") && nextUrl.searchParams.has("portal")) {
      return NextResponse.next();
    }
    // Each side has its own door, so someone following a portal link is sent
    // to the portal's sign-in rather than the staff one.
    return NextResponse.redirect(new URL(isPortal ? "/portal/login" : "/login", nextUrl));
  }

  // FR-9, both directions, by user_type OR role — either one alone marks a
  // portal user. The portal's own guard (getCustomerScope) then requires BOTH,
  // so a record where the two disagree gets neither side.
  const isCustomer = session.user.userType === "customer" || session.user.role === "customer";
  if (isCustomer) {
    // Stored files are served to customers too — their own artwork only; the
    // route checks ownership (app/api/files).
    if (path.startsWith("/api/files/")) return NextResponse.next();
    if (isPortal && !isPortalLogin) return NextResponse.next();
    return NextResponse.redirect(new URL("/portal", nextUrl));
  }

  if (isPortal || isPortalLogin) {
    return NextResponse.redirect(
      new URL(session.user.businessId ? "/dashboard" : "/select-business", nextUrl),
    );
  }

  if (isAuthRoute) {
    return NextResponse.redirect(
      new URL(session.user.businessId ? "/dashboard" : "/select-business", nextUrl),
    );
  }

  // No active business yet: everything funnels to the picker, which also
  // handles the "no memberships at all" dead end without looping.
  if (!session.user.businessId && !isPicker) {
    return NextResponse.redirect(new URL("/select-business", nextUrl));
  }

  if (session.user.businessId && isPicker && session.user.membershipCount <= 1) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl));
  }

  return NextResponse.next();
});

/**
 * The gate, with one thing taken away: the session cookie it rewrites.
 *
 * ── Why a response may not re-issue the session ──────────────────────────────
 * Auth.js refreshes the session cookie on EVERY response that passes through
 * its middleware. Each response therefore carries a token built from the cookie
 * that request arrived with — and a request that was already in flight when the
 * session changed lands afterwards and puts the OLD session back.
 *
 * That is not theoretical. Switching the active business writes a new session
 * in a Server Action; the sidebar's link prefetches, a dozen of them, were in
 * flight at that moment, and whichever finished last decided which business the
 * user was in. The top bar showed the new one — it was rendered inside the
 * action's own response — and every request after it was scoped to the old one.
 * A tenant boundary that is right on the screen and wrong on the server is the
 * worst shape this bug could take, and nothing on the screen admits to it.
 *
 * The same mechanism is already recorded in CLAUDE.md for sign-out, where a
 * response landing after the cookies were cleared restored the session.
 *
 * So: middleware reads the session, and never writes it. The cookie is written
 * at exactly the three moments it should be — sign in, sign out, and an
 * explicit `updateSession` — and a stale in-flight response can no longer
 * resurrect a session that was deliberately replaced. The cost is that the
 * 30-day window no longer slides forward on activity.
 */
export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  // The wrapper's own overloads do not name the middleware pair; it is the
  // shape Next actually calls it with.
  const run = gate as unknown as (req: NextRequest, event: NextFetchEvent) => Promise<NextResponse>;
  const res = await run(req, event);

  const kept = res.headers
    .getSetCookie()
    .filter((cookie) => !/^(__Secure-)?authjs\.session-token(\.\d+)?=/.test(cookie));
  res.headers.delete("set-cookie");
  for (const cookie of kept) res.headers.append("set-cookie", cookie);

  return res;
}

export const config = {
  // Everything except Next internals, the auth API and static brand assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|brand|favicon.ico).*)"],
};
