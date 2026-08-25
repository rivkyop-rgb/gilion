import { describe, expect, it } from "vitest";
import {
  afterAdLinked,
  availableEvents,
  canTransition,
  InvalidPublicationTransitionError,
  placementStatusFor,
  PUBLICATION_EVENTS,
  PUBLICATION_STATUSES,
  transition,
  type PublicationEvent,
  type PublicationStatus,
} from "./publication-status";

/** Transcribed independently from conventions.md §3. */
const EXPECTED: Record<PublicationStatus, Partial<Record<PublicationEvent, PublicationStatus>>> = {
  planned: {
    AD_LINKED: "ad_received",
    REMINDER_WINDOW_ENTERED: "missing_ad",
    CANCELED: "canceled",
  },
  missing_ad: { AD_LINKED: "ad_received", CANCELED: "canceled" },
  ad_received: { AD_UNLINKED: "missing_ad", CANCELED: "canceled" },
  ready_for_layout: { AD_UNLINKED: "missing_ad", PLACED: "placed", CANCELED: "canceled" },
  placed: {
    PLACEMENT_REMOVED: "ready_for_layout",
    ISSUE_CLOSED: "published",
    CANCELED: "canceled",
  },
  published: { BILLED: "billed" },
  canceled: {},
  billed: {},
};

describe("every state × event pair is decided", () => {
  for (const from of PUBLICATION_STATUSES) {
    for (const event of PUBLICATION_EVENTS) {
      const expected = EXPECTED[from][event];
      it(`${from} + ${event} → ${expected ?? "refused"}`, () => {
        if (expected) {
          expect(transition(from, event)).toBe(expected);
        } else {
          expect(() => transition(from, event)).toThrow(InvalidPublicationTransitionError);
        }
      });
    }
  }
});

describe("a published publication cannot be cancelled (rule 17)", () => {
  it("refuses CANCELED after it has run in a printed issue", () => {
    expect(() => transition("published", "CANCELED")).toThrow(
      "לא ניתן לבצע CANCELED על פרסום במצב published",
    );
  });

  it("refuses it after billing too", () => {
    expect(canTransition("billed", "CANCELED")).toBe(false);
  });

  it("allows it from every state before publication", () => {
    for (const s of [
      "planned",
      "missing_ad",
      "ad_received",
      "ready_for_layout",
      "placed",
    ] as const) {
      expect(transition(s, "CANCELED")).toBe("canceled");
    }
  });
});

describe("the full lifecycle", () => {
  it("walks planned → missing_ad → ad_received → ready_for_layout → placed → published → billed", () => {
    let s: PublicationStatus = "planned";
    s = transition(s, "REMINDER_WINDOW_ENTERED");
    expect(s).toBe("missing_ad");
    s = transition(s, "AD_LINKED");
    expect(s).toBe("ad_received");
    s = afterAdLinked("missing_ad", { validationPassed: true, belongsToCustomer: true });
    expect(s).toBe("ready_for_layout");
    s = transition(s, "PLACED");
    expect(s).toBe("placed");
    s = transition(s, "ISSUE_CLOSED");
    expect(s).toBe("published");
    s = transition(s, "BILLED");
    expect(s).toBe("billed");
  });

  it("can bounce back and forth between placed and ready_for_layout", () => {
    expect(transition("placed", "PLACEMENT_REMOVED")).toBe("ready_for_layout");
    expect(transition("ready_for_layout", "PLACED")).toBe("placed");
  });
});

describe("linking an ad only reaches ready_for_layout when the ad is usable", () => {
  it("stops at ad_received when validation has not passed", () => {
    expect(afterAdLinked("planned", { validationPassed: false, belongsToCustomer: true })).toBe(
      "ad_received",
    );
  });

  it("stops at ad_received when the ad belongs to another customer", () => {
    expect(afterAdLinked("planned", { validationPassed: true, belongsToCustomer: false })).toBe(
      "ad_received",
    );
  });

  it("continues to ready_for_layout when both hold", () => {
    expect(afterAdLinked("planned", { validationPassed: true, belongsToCustomer: true })).toBe(
      "ready_for_layout",
    );
  });

  it("refuses to link an ad onto a published publication", () => {
    expect(() =>
      afterAdLinked("published", { validationPassed: true, belongsToCustomer: true }),
    ).toThrow(InvalidPublicationTransitionError);
  });
});

describe("placement_status is derived, never stored on its own", () => {
  it("reports placed exactly while an active placement exists", () => {
    expect(placementStatusFor(true)).toBe("placed");
    expect(placementStatusFor(false)).toBe("not_placed");
  });
});

describe("terminal states", () => {
  it("canceled accepts nothing", () => {
    expect(availableEvents("canceled")).toEqual([]);
  });

  it("billed accepts nothing", () => {
    expect(availableEvents("billed")).toEqual([]);
  });
});
