import type { Role } from "./rbac";

/**
 * The JWT/session callbacks, with no Node-only imports.
 *
 * middleware.ts runs in the Edge runtime, which cannot load Prisma or bcrypt.
 * Auth.js is therefore instantiated twice: the full config (Node) owns the
 * credentials provider and the database, while the edge instance only needs to
 * verify an already-signed token and expose its claims. Both share the shaping
 * below so the two never drift.
 */
export const sessionCallbacks = {
  async session({ session, token }: { session: any; token: any }) {
    session.user.id = token.sub!;
    session.user.userType = token.userType as "internal" | "customer";
    session.user.businessId = token.businessId as string | undefined;
    session.user.role = token.role as Role | undefined;
    session.user.customerId = token.customerId as string | undefined;
    session.user.membershipCount = (token.membershipCount as number | undefined) ?? 0;
    return session;
  },
};
