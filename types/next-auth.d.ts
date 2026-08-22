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
    };
  }

  interface User {
    userType?: "internal" | "customer";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userType?: "internal" | "customer";
    businessId?: string;
    role?: Role;
    customerId?: string;
    membershipCount?: number;
  }
}

export {};
