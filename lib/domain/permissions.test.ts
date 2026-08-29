import { describe, expect, it } from "vitest";
import { access as defaultAccess } from "@/lib/auth/rbac";
import {
  cellChangeBlocked,
  EDITABLE_AREAS,
  EDITABLE_ROLES,
  effectiveAccess,
  isEditableCell,
  overrideKey,
  readSubmittedMatrix,
} from "./permissions";

describe("what may be edited at all", () => {
  it("never offers the customer role — FR-9 draws that line", () => {
    expect(EDITABLE_ROLES).not.toContain("customer");
    expect(isEditableCell("customer", "orders")).toBe(false);
  });

  it("never offers the portal or the platform area", () => {
    expect(EDITABLE_AREAS).not.toContain("portal");
    expect(EDITABLE_AREAS).not.toContain("platform");
    expect(isEditableCell("admin", "platform")).toBe(false);
  });

  it("offers the four internal roles across the remaining areas", () => {
    expect(EDITABLE_ROLES).toEqual(["admin", "sales", "designer", "accounting"]);
    expect(EDITABLE_AREAS).toContain("billing");
    expect(EDITABLE_AREAS).toContain("settings");
  });
});

describe("effectiveAccess", () => {
  it("falls back to the built-in default when nothing was overridden", () => {
    expect(effectiveAccess("designer", "billing")).toBe(defaultAccess("designer", "billing"));
    expect(effectiveAccess("designer", "billing")).toBe("none");
  });

  it("obeys an override", () => {
    const o = { [overrideKey("designer", "billing")]: "read" as const };
    expect(effectiveAccess("designer", "billing", o)).toBe("read");
  });

  it("IGNORES an override on a cell that may not be edited", () => {
    // A row that should never have been written must not become effective
    // merely because it exists in the table.
    const o = {
      [overrideKey("customer", "orders")]: "write" as const,
      [overrideKey("sales", "portal")]: "write" as const,
    };
    expect(effectiveAccess("customer", "orders", o)).toBe("none");
    expect(effectiveAccess("sales", "portal", o)).toBe("none");
  });
});

describe("cellChangeBlocked — the lock-out guard", () => {
  it("refuses to lower admin's write access to settings", () => {
    for (const next of ["none", "read"] as const) {
      expect(cellChangeBlocked("admin", "settings", next)).toContain("לא תהיה דרך להחזיר");
    }
    expect(cellChangeBlocked("admin", "settings", "write")).toBeNull();
  });

  it("refuses any change to the customer role or the closed areas", () => {
    expect(cellChangeBlocked("customer", "orders", "read")).toContain("בפורטל");
    expect(cellChangeBlocked("sales", "portal", "read")).toContain("ללקוחות בלבד");
    expect(cellChangeBlocked("admin", "platform", "write")).toContain("מנהל־על");
  });

  it("allows an ordinary change", () => {
    expect(cellChangeBlocked("designer", "billing", "read")).toBeNull();
    expect(cellChangeBlocked("sales", "settings", "none")).toBeNull();
  });
});

describe("readSubmittedMatrix", () => {
  const full = () => {
    const out: Record<string, string> = {};
    for (const role of EDITABLE_ROLES) {
      for (const area of EDITABLE_AREAS) out[overrideKey(role, area)] = defaultAccess(role, area);
    }
    return out;
  };

  it("stores nothing when everything matches the defaults", () => {
    const res = readSubmittedMatrix(full());
    expect("overrides" in res && Object.keys(res.overrides)).toEqual([]);
  });

  it("stores only the cells that differ", () => {
    const submitted = { ...full(), [overrideKey("designer", "billing")]: "read" };
    const res = readSubmittedMatrix(submitted);
    expect("overrides" in res && res.overrides).toEqual({
      [overrideKey("designer", "billing")]: "read",
    });
  });

  it("refuses a submission that would lock the admin out", () => {
    const submitted = { ...full(), [overrideKey("admin", "settings")]: "read" };
    const res = readSubmittedMatrix(submitted);
    expect("error" in res && res.error).toContain("לא תהיה דרך להחזיר");
  });

  it("refuses an unknown access value rather than guessing", () => {
    const submitted = { ...full(), [overrideKey("sales", "orders")]: "maybe" };
    const res = readSubmittedMatrix(submitted);
    expect("error" in res && res.error).toContain("לא מוכר");
  });

  it("ignores keys for cells that are not editable", () => {
    const submitted = { ...full(), [overrideKey("customer", "orders")]: "write" };
    const res = readSubmittedMatrix(submitted);
    expect("overrides" in res && Object.keys(res.overrides)).toEqual([]);
  });
});
