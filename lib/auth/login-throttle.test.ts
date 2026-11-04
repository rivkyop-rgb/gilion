import { describe, expect, it } from "vitest";
import { LoginThrottle, MAX_PER_ACCOUNT, MAX_PER_ORIGIN, WINDOW_MS } from "./login-throttle";

describe("wrong-password ceiling", () => {
  it("stops one account after the limit, and lets it try again after the window", () => {
    let t = 0;
    const th = new LoginThrottle(() => t);
    for (let i = 0; i < MAX_PER_ACCOUNT; i++) th.failed("a@x", `ip${i}`);
    expect(th.allowed("a@x", "fresh")).toBe(false);
    expect(th.allowed("b@x", "fresh")).toBe(true);
    t += WINDOW_MS + 1;
    expect(th.allowed("a@x", "fresh")).toBe(true);
  });

  it("stops one machine trying many accounts", () => {
    const th = new LoginThrottle(() => 0);
    for (let i = 0; i < MAX_PER_ORIGIN; i++) th.failed(`u${i}@x`, "1.2.3.4");
    expect(th.allowed("new@x", "1.2.3.4")).toBe(false);
    expect(th.allowed("new@x", "5.6.7.8")).toBe(true);
  });

  it("a right password clears the account", () => {
    const th = new LoginThrottle(() => 0);
    for (let i = 0; i < MAX_PER_ACCOUNT; i++) th.failed("a@x", "ip");
    th.succeeded("a@x");
    expect(th.allowed("a@x", "other")).toBe(true);
  });
});
