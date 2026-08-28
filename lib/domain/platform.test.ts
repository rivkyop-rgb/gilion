import { describe, expect, it } from "vitest";
import {
  deactivationBlocked,
  deactivationConsequence,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  validateNewBusiness,
} from "./platform";

const valid = {
  businessName: "הוצאת הדרום",
  adminName: "שרה כהן",
  adminEmail: "Sara@Example.COM",
  adminPassword: "sup3rsecret",
};

describe("validateNewBusiness", () => {
  it("accepts a complete pair of business and first admin", () => {
    expect(validateNewBusiness(valid)).toEqual([]);
  });

  it("requires the business name", () => {
    const e = validateNewBusiness({ ...valid, businessName: "   " });
    expect(e.map((x) => x.field)).toContain("businessName");
  });

  it("requires an admin — a business nobody can enter is not a business", () => {
    const e = validateNewBusiness({ ...valid, adminName: "", adminEmail: "" });
    expect(e.map((x) => x.field)).toEqual(expect.arrayContaining(["adminName", "adminEmail"]));
  });

  it("rejects an address that cannot be routed", () => {
    for (const bad of ["nope", "a@b", "a b@c.com", "@example.com"]) {
      const e = validateNewBusiness({ ...valid, adminEmail: bad });
      expect(e.map((x) => x.field)).toContain("adminEmail");
    }
  });

  it("enforces a minimum password length, since nothing else will", () => {
    const e = validateNewBusiness({ ...valid, adminPassword: "a".repeat(MIN_PASSWORD_LENGTH - 1) });
    expect(e.map((x) => x.field)).toContain("adminPassword");
    expect(
      validateNewBusiness({ ...valid, adminPassword: "a".repeat(MIN_PASSWORD_LENGTH) }),
    ).toEqual([]);
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims, so a login cannot miss by case", () => {
    expect(normalizeEmail("  Sara@Example.COM ")).toBe("sara@example.com");
  });
});

describe("deactivationBlocked", () => {
  it("refuses to close the business you are standing in", () => {
    expect(deactivationBlocked("biz_a", "biz_a")).toContain("שאת עובדת בו כרגע");
  });

  it("allows closing any other business", () => {
    expect(deactivationBlocked("biz_a", "biz_b")).toBeNull();
  });
});

describe("deactivationConsequence", () => {
  it("says what is lost and what is kept, in that order", () => {
    const msg = deactivationConsequence({ users: 3, newspapers: 2, customers: 40 });
    expect(msg).toContain("3 משתמשים לא יוכלו להיכנס");
    expect(msg).toContain("יישמרו במלואם");
    expect(msg.indexOf("לא יוכלו")).toBeLessThan(msg.indexOf("יישמרו"));
  });
});
