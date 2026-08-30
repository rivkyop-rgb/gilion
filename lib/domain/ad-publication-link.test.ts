import { describe, expect, it } from "vitest";

import { isPlaceable, placeabilityNote, refuseLink, type LinkableAd } from "./ad-link";
import { afterAdLinked, transition } from "./publication-status";

const goodAd: LinkableAd = {
  id: "ad1",
  customerId: "cust1",
  validationPassed: true,
  archived: false,
};

const publication = { id: "pub1", customerId: "cust1", status: "missing_ad" as const };

describe("isPlaceable", () => {
  it("needs both a passing validation and a customer", () => {
    expect(isPlaceable(goodAd)).toBe(true);
    expect(isPlaceable({ ...goodAd, customerId: null })).toBe(false);
    expect(isPlaceable({ ...goodAd, validationPassed: false })).toBe(false);
    expect(isPlaceable({ ...goodAd, archived: true })).toBe(false);
  });
});

describe("refuseLink", () => {
  it("allows the ordinary case", () => {
    expect(refuseLink(goodAd, publication)).toBeNull();
  });

  it("refuses an ad with no customer (US-005 AC-4)", () => {
    const refusal = refuseLink({ ...goodAd, customerId: null }, publication);
    expect(refusal?.message).toContain("אינה משויכת ללקוח");
  });

  it("refuses an ad that failed validation (US-005 AC-2)", () => {
    const refusal = refuseLink({ ...goodAd, validationPassed: false }, publication);
    expect(refusal?.message).toContain("תקינות");
  });

  it("refuses when the ad and the publication belong to different customers", () => {
    const refusal = refuseLink(goodAd, { ...publication, customerId: "cust2" });
    expect(refusal?.message).toContain("לקוח אחר");
  });

  it("refuses a publication that is past the point of receiving material", () => {
    expect(refuseLink(goodAd, { ...publication, status: "placed" })).not.toBeNull();
    expect(refuseLink(goodAd, { ...publication, status: "published" })).not.toBeNull();
  });

  it("accepts a publication that is still only planned", () => {
    expect(refuseLink(goodAd, { ...publication, status: "planned" })).toBeNull();
  });
});

describe("status transitions on link and unlink (rule 10)", () => {
  it("carries a usable ad all the way to ready_for_layout", () => {
    expect(afterAdLinked("missing_ad", { validationPassed: true, belongsToCustomer: true })).toBe(
      "ready_for_layout",
    );
    expect(afterAdLinked("planned", { validationPassed: true, belongsToCustomer: true })).toBe(
      "ready_for_layout",
    );
  });

  it("stops at ad_received when the ad has no customer — it is not placeable", () => {
    expect(afterAdLinked("missing_ad", { validationPassed: true, belongsToCustomer: false })).toBe(
      "ad_received",
    );
  });

  it("stops at ad_received when the file did not pass validation", () => {
    expect(afterAdLinked("missing_ad", { validationPassed: false, belongsToCustomer: true })).toBe(
      "ad_received",
    );
  });

  it("sends a publication back to missing_ad when the ad is detached", () => {
    expect(transition("ready_for_layout", "AD_UNLINKED")).toBe("missing_ad");
    expect(transition("ad_received", "AD_UNLINKED")).toBe("missing_ad");
  });

  it("refuses to unlink a publication that never had an ad", () => {
    expect(() => transition("planned", "AD_UNLINKED")).toThrow();
  });
});

describe("placeabilityNote", () => {
  it("says nothing about an ad that is ready", () => {
    expect(placeabilityNote(goodAd)).toBeNull();
  });

  it("explains, in Hebrew, why an ad without a customer cannot be placed", () => {
    expect(placeabilityNote({ ...goodAd, customerId: null })).toBe(
      "מודעה ללא לקוח אינה זמינה לשיבוץ",
    );
  });
});
