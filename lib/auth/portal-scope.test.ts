import { describe, expect, it } from "vitest";
import { customerScopeFrom, isPortalUser, NotCustomerError } from "./portal-scope";

const customer = {
  id: "usr_c",
  userType: "customer" as const,
  role: "customer",
  businessId: "biz_alpha",
  customerId: "cust_alpha_1",
};

describe("getCustomerScope rule (FR-9)", () => {
  it("returns user, business and customer for a portal customer", () => {
    expect(customerScopeFrom(customer)).toEqual({
      userId: "usr_c",
      businessId: "biz_alpha",
      customerId: "cust_alpha_1",
    });
  });

  it.each(["admin", "sales", "designer", "accounting"])("throws for role %s", (role) => {
    expect(() => customerScopeFrom({ ...customer, role })).toThrow(NotCustomerError);
  });

  it("throws for an internal user even holding a customer role — both facts are required", () => {
    expect(() => customerScopeFrom({ ...customer, userType: "internal" })).toThrow(
      NotCustomerError,
    );
  });

  it("throws without a session, a business or a customer", () => {
    expect(() => customerScopeFrom(null)).toThrow(NotCustomerError);
    expect(() => customerScopeFrom({ ...customer, businessId: undefined })).toThrow(
      NotCustomerError,
    );
    expect(() => customerScopeFrom({ ...customer, customerId: undefined })).toThrow(
      NotCustomerError,
    );
  });

  it("routes a user to the portal on EITHER fact, so a mismatch reaches neither side", () => {
    expect(isPortalUser({ userType: "customer", role: "sales" })).toBe(true);
    expect(isPortalUser({ userType: "internal", role: "customer" })).toBe(true);
    expect(isPortalUser({ userType: "internal", role: "sales" })).toBe(false);
  });
});
