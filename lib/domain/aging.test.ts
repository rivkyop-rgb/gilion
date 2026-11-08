import { describe, expect, it } from "vitest";
import { agingBuckets } from "./aging";

const today = new Date("2026-11-08T12:00:00Z");
const ago = (days: number) => new Date(today.getTime() - days * 86_400_000);

describe("agingBuckets", () => {
  it("files each unpaid publication by its own print date", () => {
    const buckets = agingBuckets(
      [
        { customerId: "a", date: ago(5), open: 100 },
        { customerId: "a", date: ago(45), open: 200 },
        { customerId: "b", date: ago(45), open: 50 },
        { customerId: "b", date: ago(120), open: 300 },
        { customerId: "c", date: ago(10), open: 0 },
      ],
      today,
    );
    expect(buckets.map((b) => [b.key, b.amount, b.customers])).toEqual([
      ["0-30", 100, 1],
      ["31-60", 250, 2],
      ["61-90", 0, 0],
      ["90+", 300, 1],
    ]);
  });

  it("breaks a bucket down by customer, largest debt first, each with its publications", () => {
    const second = agingBuckets(
      [
        { customerId: "a", date: ago(40), open: 80 },
        { customerId: "b", date: ago(50), open: 120 },
        { customerId: "a", date: ago(35), open: 20 },
        { customerId: "b", date: ago(33), open: 30 },
      ],
      today,
    )[1]!;
    expect(second.breakdown.map((c) => [c.customerId, c.amount, c.items.length])).toEqual([
      ["b", 150, 2],
      ["a", 100, 2],
    ]);
    // Oldest first inside a customer — the order a statement reads in.
    expect(second.breakdown[0]!.items.map((i) => i.open)).toEqual([120, 30]);
  });
});
