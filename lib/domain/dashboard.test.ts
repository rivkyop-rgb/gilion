import { describe, expect, it } from "vitest";

import { access, type Area } from "@/lib/auth/rbac";
import {
  attentionReason,
  cardsFor,
  DASHBOARD_CARDS,
  MISSING_AD_STATES,
  OPEN_ISSUE_STATES,
  showsMoney,
} from "./dashboard";

const reader = (role: Parameters<typeof access>[0]) => (area: Area) =>
  access(role, area) !== "none";

describe("the six areas of FR-20", () => {
  it("has exactly six cards, and none of them is the invented proofing one", () => {
    expect(DASHBOARD_CARDS).toHaveLength(6);
    expect(DASHBOARD_CARDS.map((c) => c.label)).not.toContain("מודעות להגהה");
  });

  it("counts an issue that is ready for print as still open", () => {
    // It is locked for editing, not gone to press. Dropping it makes the count
    // go quiet exactly when somebody is deciding whether to close.
    expect(OPEN_ISSUE_STATES).toContain("ready_for_print");
    expect(OPEN_ISSUE_STATES).not.toContain("closed");
  });

  it("treats `planned` as missing artwork, not only `missing_ad`", () => {
    // A publication sold further out than the reminder window is still
    // `planned`. Counting the enum value alone reports zero until too late.
    expect(MISSING_AD_STATES).toContain("planned");
  });

  it("hands Prisma a mutable array — a frozen tuple is refused by `in`", () => {
    expect(Array.isArray(OPEN_ISSUE_STATES)).toBe(true);
    expect(Object.isFrozen(OPEN_ISSUE_STATES)).toBe(false);
  });
});

describe("cardsFor — FR-8 decides what is even computed", () => {
  it("gives an admin all six", () => {
    expect(cardsFor(reader("admin"))).toHaveLength(6);
  });

  it("never gives a designer the debt card", () => {
    const keys = cardsFor(reader("designer")).map((c) => c.key);
    expect(keys).not.toContain("debt");
    expect(keys).toContain("notPlaced");
  });

  it("gives accounting the debt card but not the reminders one", () => {
    const keys = cardsFor(reader("accounting")).map((c) => c.key);
    expect(keys).toContain("debt");
    expect(keys).not.toContain("reminders");
  });

  it("follows a moved cell, not the static matrix", () => {
    // A business that closed `billing` for its admin loses the card with it.
    const overridden = (area: Area) => area !== "billing" && access("admin", area) !== "none";
    expect(cardsFor(overridden).map((c) => c.key)).not.toContain("debt");
  });
});

describe("showsMoney", () => {
  it("is false only for a designer", () => {
    expect(showsMoney("designer")).toBe(false);
    expect(showsMoney("admin")).toBe(true);
    expect(showsMoney("sales")).toBe(true);
    expect(showsMoney("accounting")).toBe(true);
  });
});

describe("attentionReason — US-001 AC-5", () => {
  const row = (over: Partial<Parameters<typeof attentionReason>[0]> = {}) =>
    attentionReason({
      status: "ready_for_layout",
      placementStatus: "placed",
      hasAdvertisement: true,
      ...over,
    });

  it("says nothing about a publication that is ready and placed", () => {
    expect(row()).toBeNull();
  });

  it("names the missing file before the missing placement", () => {
    // Both are true at once for most of a publication's life, and the artwork
    // is the one that blocks the other — telling a designer to place a file
    // that has not arrived is a task they cannot do.
    expect(
      row({ status: "missing_ad", hasAdvertisement: false, placementStatus: "not_placed" }),
    ).toBe("missing_ad");
    expect(row({ status: "planned", hasAdvertisement: false, placementStatus: "not_placed" })).toBe(
      "missing_ad",
    );
  });

  /**
   * The AND that keeps the card honest. `ready_for_layout` means a file was
   * received and validated, so a row in that state with no `advertisement_id`
   * is not a customer to chase — it is data that disagrees with itself, and
   * chasing it would put a number on the card that the list cannot produce.
   */
  it("does not call a validated row artwork-less just because a field is null", () => {
    expect(row({ status: "ready_for_layout", hasAdvertisement: false })).toBeNull();
  });

  it("names the placement once the file is in", () => {
    expect(row({ placementStatus: "not_placed" })).toBe("not_placed");
  });

  it("stays quiet on a cancelled row", () => {
    expect(
      row({ status: "canceled", hasAdvertisement: false, placementStatus: "not_placed" }),
    ).toBeNull();
  });

  it("stays quiet on one that already ran", () => {
    expect(row({ status: "published", placementStatus: "not_placed" })).toBeNull();
    expect(row({ status: "canceled", placementStatus: "not_placed" })).toBeNull();
  });
});
