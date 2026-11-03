import { beforeAll, describe, expect, it } from "vitest";
import { adViewPath, adViewToken, verifyAdViewToken } from "./ad-view-token";

beforeAll(() => {
  process.env.AUTH_SECRET ??= "test-secret";
});

describe("ad view link", () => {
  it("opens the publication it was made for, and no other", () => {
    expect(verifyAdViewToken("pub1", adViewToken("pub1"))).toBe(true);
    expect(verifyAdViewToken("pub2", adViewToken("pub1"))).toBe(false);
    expect(verifyAdViewToken("pub1", "short")).toBe(false);
  });
  it("is a path under /api/ad-view", () => {
    expect(adViewPath("pub1")).toMatch(/^\/api\/ad-view\/pub1\/[\w-]{32}$/);
  });
});
