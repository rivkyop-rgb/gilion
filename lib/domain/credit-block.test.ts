import { describe, expect, it } from "vitest";
import { creditVerdict } from "./credit-block";

describe("creditVerdict", () => {
  it("blocks past the age limit", () => {
    const v = creditVerdict({ days: 60, amount: null }, { debt: 500, oldestDays: 75 });
    expect(v.blocked).toBe(true);
  });
  it("blocks past the amount limit", () => {
    expect(creditVerdict({ days: null, amount: 1000 }, { debt: 1200, oldestDays: 3 }).blocked).toBe(
      true,
    );
  });
  it("does not block under both limits, with no policy, or with no printed debt", () => {
    expect(creditVerdict({ days: 60, amount: 1000 }, { debt: 900, oldestDays: 30 }).blocked).toBe(false);
    expect(creditVerdict({ days: null, amount: null }, { debt: 99999, oldestDays: 400 }).blocked).toBe(
      false,
    );
    expect(creditVerdict({ days: 1, amount: 1 }, { debt: 0, oldestDays: null }).blocked).toBe(false);
  });
  it("says both reasons when both apply", () => {
    const v = creditVerdict({ days: 30, amount: 100 }, { debt: 500, oldestDays: 45 });
    expect(v.blocked && v.reason).toContain("·");
  });
});
