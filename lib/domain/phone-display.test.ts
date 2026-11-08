import { describe, expect, it } from "vitest";
import { displayPhone } from "./phone-display";

describe("displayPhone", () => {
  it("adds the dash people expect", () => {
    expect(displayPhone("035551234")).toBe("03-5551234");
    expect(displayPhone("0549998877")).toBe("054-9998877");
    expect(displayPhone("0771234567")).toBe("077-1234567");
  });
  it("leaves anything else as it was stored", () => {
    expect(displayPhone("+972541234567")).toBe("+972541234567");
    expect(displayPhone("1700500500")).toBe("1700500500");
  });
});
