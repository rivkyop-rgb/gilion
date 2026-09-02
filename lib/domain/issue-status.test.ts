import { describe, expect, it } from "vitest";

import {
  availableTransitions,
  canTransition,
  InvalidIssueTransitionError,
  isBackward,
  isEditable,
  IssueLockedError,
  ISSUE_STATUSES,
  lockReason,
  requireEditable,
  transition,
} from "./issue-status";

describe("the four states", () => {
  it("walks forward one step at a time", () => {
    expect(transition("draft", "in_layout", false)).toBe("in_layout");
    expect(transition("in_layout", "ready_for_print", false)).toBe("ready_for_print");
    expect(transition("ready_for_print", "closed", false)).toBe("closed");
  });

  it("refuses to skip a step forward", () => {
    expect(canTransition("draft", "ready_for_print", false)).toBe(false);
    expect(canTransition("draft", "closed", true)).toBe(false);
    expect(() => transition("draft", "closed", true)).toThrow(InvalidIssueTransitionError);
  });

  it("refuses a transition to the same state", () => {
    for (const s of ISSUE_STATUSES) expect(canTransition(s, s, true)).toBe(false);
  });
});

describe("going backwards is admin-only", () => {
  it("refuses a non-admin", () => {
    expect(canTransition("closed", "in_layout", false)).toBe(false);
    expect(canTransition("in_layout", "draft", false)).toBe(false);
  });

  it("allows an admin to jump any distance back", () => {
    expect(transition("closed", "draft", true)).toBe("draft");
    expect(transition("ready_for_print", "in_layout", true)).toBe("in_layout");
  });

  it("names the backward move so the caller knows to audit it", () => {
    expect(isBackward("closed", "in_layout")).toBe(true);
    expect(isBackward("draft", "in_layout")).toBe(false);
  });
});

describe("editability (FR-6)", () => {
  it("leaves draft and in_layout open to everyone with write access", () => {
    expect(isEditable("draft", false)).toBe(true);
    expect(isEditable("in_layout", false)).toBe(true);
  });

  it("restricts ready_for_print to admins", () => {
    expect(isEditable("ready_for_print", false)).toBe(false);
    expect(isEditable("ready_for_print", true)).toBe(true);
  });

  it("blocks a closed issue for an admin too", () => {
    expect(isEditable("closed", true)).toBe(false);
    expect(isEditable("closed", false)).toBe(false);
  });

  it("throws with the Hebrew the board shows", () => {
    expect(() => requireEditable("closed", true)).toThrow(IssueLockedError);
    expect(() => requireEditable("closed", true)).toThrow("גיליון סגור");
    expect(() => requireEditable("in_layout", false)).not.toThrow();
  });

  it("has no lock reason while the issue is open", () => {
    expect(lockReason("draft")).toBeNull();
    expect(lockReason("ready_for_print", true)).toBeNull();
    expect(lockReason("ready_for_print", false)).toContain("מנהל");
  });
});

describe("what the status menu offers", () => {
  it("offers only the next step to a designer", () => {
    expect(availableTransitions("in_layout", false)).toEqual(["ready_for_print"]);
  });

  it("offers the way back to an admin", () => {
    expect(availableTransitions("in_layout", true)).toEqual(["draft", "ready_for_print"]);
  });

  it("offers a closed issue nothing at all to a designer", () => {
    expect(availableTransitions("closed", false)).toEqual([]);
  });
});
