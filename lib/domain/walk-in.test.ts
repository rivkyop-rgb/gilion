import { describe, expect, it } from "vitest";

import { walkInApprovalProblem, walkInName } from "./walk-in";

describe("walkInApprovalProblem", () => {
  it("wants the name first", () => {
    expect(walkInApprovalProblem({ notes: "  ", paid: 500, total: 500 })).toContain("שם הלקוח");
  });
  it("wants the money before approval, and says how much is missing", () => {
    expect(walkInApprovalProblem({ notes: "משה", paid: 300, total: 500 })).toContain("₪200.00");
  });
  it("lets a paid order through, to the agora", () => {
    expect(walkInApprovalProblem({ notes: "משה", paid: 499.999, total: 500 })).toBeNull();
    expect(walkInApprovalProblem({ notes: "משה", paid: 600, total: 500 })).toBeNull();
  });
});

describe("walkInName", () => {
  it("is the first line of the notes", () => {
    expect(walkInName("משה כהן\n050-1234567")).toBe("משה כהן");
    expect(walkInName(null)).toBe("");
  });
});
