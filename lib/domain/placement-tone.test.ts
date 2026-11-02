import { describe, expect, it } from "vitest";
import { placementTone } from "./placement-tone";

const base = {
  orderStatus: "approved",
  adStatus: "active",
  validationStatus: "passed",
  duplicate: false,
  hasPreview: true,
};

describe("placementTone", () => {
  it("is ready when the order is approved and the file is good", () => {
    expect(placementTone(base).tone).toBe("ready");
  });
  it("waits while the order is not approved", () => {
    expect(placementTone({ ...base, orderStatus: "pending_approval" }).tone).toBe("attention");
  });
  it("waits when the file has no preview to check", () => {
    expect(placementTone({ ...base, hasPreview: false }).tone).toBe("attention");
  });
  it("is a problem when the ad was archived, whatever else is true", () => {
    expect(placementTone({ ...base, adStatus: "archived" }).tone).toBe("problem");
  });
  it("is a problem when the order was cancelled", () => {
    expect(placementTone({ ...base, orderStatus: "canceled" }).tone).toBe("problem");
  });
});
