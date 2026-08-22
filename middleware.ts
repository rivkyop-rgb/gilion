import { NextResponse } from "next/server";
import { authEdge } from "@/lib/auth/edge";

/**
 * Route gating (FR-2, FR-9).
 *
 * This is the first line only. Every internal layout and Server Action repeats
 * the check, because middleware runs on the edge with a matcher that is easy to
 * get wrong, and a tenancy hole must not depend on one regex being right.
 */
export default authEdge((req) => {
  const { nextUrl } = req;
  const session = req.auth;
  const path = nextUrl.pathname;

  const isAuthRoute = path === "/login";
  const isPicker = path === "/select-business";
  const isPortalOnly = path === "/portal-only";

  if (!session?.user) {
    if (isAuthRoute) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  // FR-9: a customer-portal user has no business inside the internal app.
  // The portal itself arrives in stage 09.
  if (session.user.userType === "customer") {
    if (isPortalOnly) return NextResponse.next();
    return NextResponse.redirect(new URL("/portal-only", nextUrl));
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

export const config = {
  // Everything except Next internals, the auth API and static brand assets.
  matcher: ["/((?!api/auth|_next/static|_next/image|brand|favicon.ico).*)"],
};
