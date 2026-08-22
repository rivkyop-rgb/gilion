import { describe, expect, it } from "vitest";

// Stage 00 has no business logic yet. This test exists to prove the Vitest
// pipeline runs at all; stage 01 replaces it with real domain tests.
describe("test pipeline", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
