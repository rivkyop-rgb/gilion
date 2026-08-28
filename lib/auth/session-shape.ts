import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import type { Role } from "./rbac";

/**
 * The session callback, with no Node-only imports.
 *
 * middleware.ts runs in the Edge runtime, which cannot load Prisma or bcrypt.
 * Auth.js is therefore instantiated twice: the full config (Node) owns the
 * credentials provider and the database, while the edge instance only verifies
 * an already-signed token and exposes its claims. Both share the shaping below
 * so the two can never drift.
 */
export const sessionCallbacks = {
  async session({ session, token }: { session: Session; token: JWT }): Promise<Session> {
    session.user.id = token.sub!;
    session.user.userType = token.userType ?? "internal";
    session.user.businessId = token.businessId;
    session.user.role = token.role as Role | undefined;
    session.user.customerId = token.customerId;
    session.user.membershipCount = token.membershipCount ?? 0;
    session.user.isSuperAdmin = token.isSuperAdmin === true;
    return session;
  },
};
