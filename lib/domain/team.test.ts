import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  deactivationBlocked,
  isAssignableRole,
  MIN_PASSWORD_LENGTH,
  roleChangeBlocked,
  validateMember,
  type MemberSnapshot,
} from "./team";

const valid = {
  name: "דנה לוי",
  email: "Dana@Example.COM",
  password: "sup3rsecret",
  role: "sales",
};

const admin = (id: string, active = true): MemberSnapshot => ({
  userId: id,
  role: "admin",
  active,
});
const sales = (id: string, active = true): MemberSnapshot => ({
  userId: id,
  role: "sales",
  active,
});

describe("assignable roles", () => {
  it("never offers `customer` — the portal is not staff (FR-9)", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("customer");
    expect(isAssignableRole("customer")).toBe(false);
  });

  it("offers the four internal roles", () => {
    expect(ASSIGNABLE_ROLES).toEqual(["admin", "sales", "designer", "accounting"]);
  });
});

describe("validateMember", () => {
  it("accepts a complete member", () => {
    expect(validateMember(valid)).toEqual([]);
  });

  it("requires name, a routable email and a long enough password", () => {
    const e = validateMember({ name: " ", email: "nope", password: "short", role: "sales" });
    expect(e.map((x) => x.field).sort()).toEqual(["email", "name", "password"]);
  });

  it("rejects a role that is not assignable", () => {
    expect(validateMember({ ...valid, role: "customer" }).map((x) => x.field)).toContain("role");
    expect(validateMember({ ...valid, role: "" }).map((x) => x.field)).toContain("role");
  });

  it("accepts exactly the minimum password length", () => {
    expect(validateMember({ ...valid, password: "a".repeat(MIN_PASSWORD_LENGTH) })).toEqual([]);
  });
});

describe("deactivationBlocked — nobody locks themselves out", () => {
  it("refuses removing your own access, even with other admins around", () => {
    const all = [admin("me"), admin("other")];
    expect(deactivationBlocked(admin("me"), "me", all)).toContain("של עצמך");
  });

  it("refuses removing the last active admin", () => {
    const all = [admin("boss"), sales("s1")];
    expect(deactivationBlocked(admin("boss"), "someone-else", all)).toContain("המנהל הפעיל האחרון");
  });

  it("allows it once a second active admin exists", () => {
    const all = [admin("boss"), admin("deputy")];
    expect(deactivationBlocked(admin("boss"), "deputy", all)).toBeNull();
  });

  it("does not count an inactive admin as cover", () => {
    const all = [admin("boss"), admin("onLeave", false)];
    expect(deactivationBlocked(admin("boss"), "someone-else", all)).toContain("האחרון");
  });

  it("allows removing a non-admin freely", () => {
    expect(deactivationBlocked(sales("s1"), "boss", [admin("boss"), sales("s1")])).toBeNull();
  });

  it("is a no-op on someone already inactive", () => {
    expect(deactivationBlocked(admin("x", false), "boss", [admin("boss")])).toBeNull();
  });
});

describe("roleChangeBlocked", () => {
  it("refuses demoting yourself out of admin", () => {
    const all = [admin("me"), admin("other")];
    expect(roleChangeBlocked(admin("me"), "sales", "me", all)).toContain("לעצמך");
  });

  it("refuses demoting the last active admin", () => {
    const all = [admin("boss"), sales("s1")];
    expect(roleChangeBlocked(admin("boss"), "sales", "someone-else", all)).toContain("האחרון");
  });

  it("allows demoting an admin when another remains", () => {
    const all = [admin("boss"), admin("deputy")];
    expect(roleChangeBlocked(admin("boss"), "sales", "deputy", all)).toBeNull();
  });

  it("allows promoting anyone to admin, including yourself", () => {
    const all = [admin("boss"), sales("s1")];
    expect(roleChangeBlocked(sales("s1"), "admin", "boss", all)).toBeNull();
    expect(roleChangeBlocked(admin("boss"), "admin", "boss", all)).toBeNull();
  });

  it("rejects a role outside the assignable set", () => {
    expect(roleChangeBlocked(sales("s1"), "customer", "boss", [admin("b")])).toBe("תפקיד לא מוכר");
  });
});
