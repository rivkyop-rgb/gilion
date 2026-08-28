import type { Role } from "@/lib/auth/rbac";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      userType: "internal" | "customer";
      /** Undefined until a business is chosen — this is the /select-business gate. */
      businessId?: string;
      role?: Role;
      customerId?: string;
      membershipCount: number;
      /** Platform owner — may enter any business. Not a Role; see rbac.ts. */
      isSuperAdmin: boolean;
    };
  }

  interface User {
    userType?: "internal" | "customer";
    isSuperAdmin?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userType?: "internal" | "customer";
    businessId?: string;
    role?: Role;
    customerId?: string;
    membershipCount?: number;
    isSuperAdmin?: boolean;
  }
}

export {};
