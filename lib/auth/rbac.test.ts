import { describe, expect, it } from "vitest";
import {
  AREAS,
  ROLES,
  access,
  canRead,
  canWrite,
  readableAreas,
  requireAccess,
  canAccessPlatform,
  FORBIDDEN_DIGEST,
  ForbiddenError,
  NotSuperAdminError,
  requireSuperAdmin,
} from "./rbac";
import type { Access, Area, Role } from "./rbac";

/**
 * The expected matrix is written out here independently of the implementation,
 * transcribed from the table in docs/plan/01-auth-multitenancy.md. If the two
 * ever disagree, one of them is a bug — that is the whole point of duplicating it.
 */
const EXPECTED: Record<Area, Record<Role, Access>> = {
  dashboard: {
    admin: "write",
    sales: "write",
    designer: "write",
    accounting: "write",
    customer: "none",
  },
  customers: {
    admin: "write",
    sales: "write",
    designer: "read",
    accounting: "read",
    customer: "none",
  },
  orders: {
    admin: "write",
    sales: "write",
    designer: "none",
    accounting: "read",
    customer: "none",
  },
  publications: {
    admin: "write",
    sales: "write",
    designer: "read",
    accounting: "read",
    customer: "none",
  },
  advertisements: {
    admin: "write",
    sales: "write",
    designer: "write",
    accounting: "none",
    customer: "none",
  },
  // Chasing customers for artwork: the designer must SEE the list, because
  // their day depends on it, but making the call is not their job.
  reminders: {
    admin: "write",
    sales: "write",
    designer: "read",
    accounting: "none",
    customer: "none",
  },
  issues: {
    admin: "write",
    sales: "read",
    designer: "write",
    accounting: "none",
    customer: "none",
  },
  pdf: { admin: "write", sales: "read", designer: "write", accounting: "none", customer: "none" },
  billing: {
    admin: "write",
    sales: "none",
    designer: "none",
    accounting: "write",
    customer: "none",
  },
  reports: {
    admin: "write",
    sales: "read",
    designer: "none",
    accounting: "write",
    customer: "none",
  },
  settings: {
    admin: "write",
    sales: "none",
    designer: "none",
    accounting: "none",
    customer: "none",
  },
  audit: { admin: "write", sales: "none", designer: "none", accounting: "none", customer: "none" },
  portal: { admin: "none", sales: "none", designer: "none", accounting: "none", customer: "write" },
  // No role reaches the platform area. It is guarded by canAccessPlatform,
  // which asks about the person and not about their role in a business.
  platform: {
    admin: "none",
    sales: "none",
    designer: "none",
    accounting: "none",
    customer: "none",
  },
};

describe("RBAC matrix (FR-8, FR-9)", () => {
  it("covers every area — adding one to rbac.ts forces updating this test", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...AREAS].sort());
  });

  for (const area of AREAS) {
    for (const role of ROLES) {
      it(`${role} → ${area} = ${EXPECTED[area][role]}`, () => {
        expect(access(role, area)).toBe(EXPECTED[area][role]);
      });
    }
  }
});

describe("FR-8 — a designer never sees payment data", () => {
  it("has no access to billing", () => {
    expect(canRead("designer", "billing")).toBe(false);
    expect(canWrite("designer", "billing")).toBe(false);
  });

  it("has no access to reports either — that is where amounts also surface", () => {
    expect(canRead("designer", "reports")).toBe(false);
  });

  it("billing is absent from the menu a designer would render", () => {
    expect(readableAreas("designer")).not.toContain("billing");
  });
});

describe("FR-9 — the portal and the internal app do not overlap", () => {
  it("no internal role can reach the portal", () => {
    for (const role of ["admin", "sales", "designer", "accounting"] as const) {
      expect(canRead(role, "portal")).toBe(false);
    }
  });

  it("a customer reaches nothing but the portal", () => {
    expect(readableAreas("customer")).toEqual(["portal"]);
  });
});

describe("requireAccess", () => {
  it("passes when the role has the access", () => {
    expect(() => requireAccess("admin", "billing", "write")).not.toThrow();
    expect(() => requireAccess("accounting", "reports", "read")).not.toThrow();
  });

  it("throws ForbiddenError when the area is closed to the role", () => {
    expect(() => requireAccess("designer", "billing")).toThrow(ForbiddenError);
  });

  it("throws when read is allowed but write is asked for", () => {
    expect(() => requireAccess("sales", "issues", "read")).not.toThrow();
    expect(() => requireAccess("sales", "issues", "write")).toThrow(ForbiddenError);
  });
});

describe("super admin — above the matrix, not inside it", () => {
  it("is not a role: the five roles are unchanged", () => {
    expect(ROLES).toEqual(["admin", "sales", "designer", "accounting", "customer"]);
  });

  it("no role reaches the platform area, admin included", () => {
    for (const role of ROLES) {
      expect(canRead(role, "platform")).toBe(false);
      expect(() => requireAccess(role, "platform")).toThrow();
    }
  });

  it("opens the platform area to a super admin and to nobody else", () => {
    expect(canAccessPlatform(true)).toBe(true);
    expect(canAccessPlatform(false)).toBe(false);
    expect(() => requireAccess("admin", "platform", "write", true)).not.toThrow();
    expect(() => requireAccess("admin", "platform", "write", false)).toThrow(NotSuperAdminError);
  });

  it("passes a super admin through every area a role would be refused", () => {
    // designer has no access to billing; a super admin does.
    expect(() => requireAccess("designer", "billing")).toThrow(ForbiddenError);
    expect(() => requireAccess("designer", "billing", "read", true)).not.toThrow();
    // and write where the role only reads.
    expect(() => requireAccess("accounting", "orders", "write")).toThrow(ForbiddenError);
    expect(() => requireAccess("accounting", "orders", "write", true)).not.toThrow();
  });

  it("adds the platform area to the sidebar, without removing anything", () => {
    const asAdmin = readableAreas("admin");
    const asSuper = readableAreas("admin", true);
    expect(asAdmin).not.toContain("platform");
    expect(asSuper).toContain("platform");
    for (const a of asAdmin) expect(asSuper).toContain(a);
  });

  it("refuses the platform area with a ForbiddenError the boundary recognises", () => {
    // Same digest as ForbiddenError, so the production error boundary renders
    // the permission screen rather than the generic one.
    try {
      requireSuperAdmin(false);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as { name: string }).name).toBe("ForbiddenError");
      expect((e as { digest: string }).digest).toBe(FORBIDDEN_DIGEST);
    }
  });
});
