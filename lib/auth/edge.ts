import NextAuth from "next-auth";
import { sessionCallbacks } from "./session-shape";

/**
 * Edge-safe Auth.js instance for middleware only.
 *
 * It declares no providers: it never signs anyone in, it only verifies the JWT
 * that the Node instance issued. Importing lib/auth/config here would drag
 * Prisma and bcrypt into the Edge bundle and crash the whole app at boot.
 */
export const { auth: authEdge } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: sessionCallbacks,
});
