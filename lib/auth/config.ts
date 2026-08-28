/**
 * Auth.js setup (FR-2). Credentials only — no self-registration, no SSO in the
 * MVP; an admin creates memberships through the seed.
 *
 * The JWT carries the active business and the role in it, so getTenantContext()
 * never has to hit the database on the request path. Changing the active
 * business goes through setActiveBusiness, which re-validates the membership.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { basePrisma } from "@/lib/data/db";
import { activeMembership, activeMembershipsFor } from "./memberships";
import { sessionCallbacks } from "./session-shape";
import type { Role } from "./rbac";

export const {
  handlers,
  signIn,
  signOut,
  auth,
  unstable_update: updateSession,
} = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const email = typeof raw?.email === "string" ? raw.email.trim().toLowerCase() : "";
        const password = typeof raw?.password === "string" ? raw.password : "";
        if (!email || !password) return null;

        const user = await basePrisma.user.findUnique({ where: { email } });
        // Compare against a dummy hash when the user is missing, so a wrong
        // email and a wrong password take the same time to fail.
        const hash =
          user?.password_hash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi";
        const ok = await bcrypt.compare(password, hash);
        if (!user || !ok) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          userType: user.user_type,
          isSuperAdmin: user.is_super_admin,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user?.id) {
        token.sub = user.id;
        token.userType = (user as { userType?: "internal" | "customer" }).userType ?? "internal";
        token.isSuperAdmin = (user as { isSuperAdmin?: boolean }).isSuperAdmin === true;

        // A user with exactly one active business skips the picker (FR-2).
        //
        // A super admin never skips it: every business is theirs to enter, so
        // there is no "only one" to fall into, and landing in an arbitrary
        // tenant would be worse than being asked which.
        const memberships = token.isSuperAdmin ? [] : await activeMembershipsFor(user.id);
        token.membershipCount = memberships.length;
        const only = memberships.length === 1 ? memberships[0] : undefined;
        if (only) {
          token.businessId = only.businessId;
          token.role = only.role;
          token.customerId = only.customerId;
        }
      }

      // setActiveBusinessAction pushes the chosen tenant in via unstable_update.
      if (trigger === "update" && session && typeof session === "object") {
        const u = (session as { user?: { businessId?: string; role?: Role; customerId?: string } })
          .user;
        if (u?.businessId) {
          token.businessId = u.businessId;
          token.role = u.role;
          token.customerId = u.customerId;
        }
      }

      return token;
    },

    session: sessionCallbacks.session,
  },
});

/**
 * Re-validates a membership before it is written to the session.
 *
 * A super admin has no membership rows and needs none — the business itself
 * only has to exist. They enter as `admin`, which is what makes every screen
 * behave for them exactly as it does for the business's own admin.
 */
export async function assertMembership(userId: string, businessId: string) {
  const user = await basePrisma.user.findUnique({
    where: { id: userId },
    select: { is_super_admin: true },
  });

  if (user?.is_super_admin) {
    const business = await basePrisma.business.findUnique({
      where: { id: businessId },
      select: { id: true },
    });
    if (!business) throw new Error("no such business");
    return { businessId: business.id, role: "admin" as Role, customerId: undefined };
  }

  const m = await activeMembership(userId, businessId);
  if (!m) throw new Error("no active membership for that business");
  return m;
}
