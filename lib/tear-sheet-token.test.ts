import { beforeAll, describe, expect, it } from "vitest";
import { tearSheetPath, tearSheetToken, verifyTearSheetToken } from "./tear-sheet-token";

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret";
});

describe("the tear sheet link", () => {
  it("opens the tear sheet it was made for", () => {
    expect(verifyTearSheetToken("pub1", tearSheetToken("pub1"))).toBe(true);
  });
  it("does not open another one with the same token", () => {
    expect(verifyTearSheetToken("pub2", tearSheetToken("pub1"))).toBe(false);
  });
  it("refuses a token of the wrong length without throwing", () => {
    expect(verifyTearSheetToken("pub1", "short")).toBe(false);
  });
  it("is a path under the public route", () => {
    expect(tearSheetPath("pub1")).toMatch(/^\/api\/tear-sheet\/pub1\/[\w-]{32}$/);
  });
});
