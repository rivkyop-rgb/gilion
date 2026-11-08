import { describe, expect, it } from "vitest";
import { normaliseFilterQuery } from "./saved-filter";

describe("normaliseFilterQuery", () => {
  it("drops paging, empties and 'all', and sorts", () => {
    expect(normaliseFilterQuery("?status=all&newspaper=n1&page=3&size=50&customer=&q=abc")).toBe(
      "newspaper=n1&q=abc",
    );
  });
  it("is the same filter however it was reached", () => {
    expect(normaliseFilterQuery("b=2&a=1")).toBe(normaliseFilterQuery("a=1&b=2"));
  });
});
