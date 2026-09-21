import { describe, expect, it } from "vitest";

import { addDays, isoDay, jerusalemDay, jerusalemDayUtcMs, weekRange } from "./calendar";

/**
 * The calendar, asserted at the hours when the two calendars disagree.
 *
 * Every case below that matters is a moment when Jerusalem has turned the page
 * and UTC has not. Picking a comfortable midday moment proves nothing: UTC and
 * Jerusalem agree on the date for most of the day, which is exactly why this
 * class of bug ships.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("jerusalemDay", () => {
  it("reads a midday moment as its own date", () => {
    expect(iso(jerusalemDay(new Date("2026-09-16T09:00:00Z")))).toBe("2026-09-16");
  });

  it("has already turned over at 22:30 UTC in summer (UTC+3)", () => {
    // 01:30 on the 20th in Jerusalem. A naive UTC read says the 19th.
    expect(iso(jerusalemDay(new Date("2026-09-19T22:30:00Z")))).toBe("2026-09-20");
  });

  it("has already turned over at 23:30 UTC in winter (UTC+2)", () => {
    expect(iso(jerusalemDay(new Date("2026-12-31T23:30:00Z")))).toBe("2027-01-01");
  });

  it("returns UTC midnight, the shape a @db.Date column comes back as", () => {
    const day = jerusalemDay(new Date("2026-09-16T09:00:00Z"));
    expect(day.getTime()).toBe(Date.UTC(2026, 8, 16));
    expect(jerusalemDayUtcMs(new Date("2026-09-16T09:00:00Z"))).toBe(day.getTime());
  });
});

describe("weekRange — Sunday through Saturday, not seven days forward", () => {
  it("wraps a Wednesday in its own Sunday–Saturday", () => {
    const { from, to } = weekRange(new Date("2026-09-16T09:00:00Z")); // Wednesday
    expect(iso(from)).toBe("2026-09-13");
    expect(iso(to)).toBe("2026-09-19");
  });

  it("starts on the day itself when the day is a Sunday", () => {
    const { from, to } = weekRange(new Date("2026-09-20T05:00:00Z"));
    expect(iso(from)).toBe("2026-09-20");
    expect(iso(to)).toBe("2026-09-26");
  });

  /**
   * The whole reason rule 2 is written down. On Wednesday the card must count
   * Sunday's and Monday's issues, which a rolling seven-day window drops —
   * and it drops a different pair every morning, so nobody can tell it is
   * wrong by looking at it twice.
   */
  it("includes days of this week that have already passed", () => {
    const { from } = weekRange(new Date("2026-09-16T09:00:00Z"));
    expect(from.getTime()).toBeLessThan(Date.UTC(2026, 8, 16));
  });

  it("moves to the next week at the Jerusalem midnight, not the UTC one", () => {
    // Saturday 22:30 UTC is already Sunday in Jerusalem: a new week.
    expect(iso(weekRange(new Date("2026-09-19T22:30:00Z")).from)).toBe("2026-09-20");
    // Two hours earlier it is still Saturday, the last day of the old one.
    expect(iso(weekRange(new Date("2026-09-19T20:30:00Z")).from)).toBe("2026-09-13");
  });

  it("spans exactly seven days", () => {
    const { from, to } = weekRange(new Date("2026-01-14T09:00:00Z"));
    expect((to.getTime() - from.getTime()) / 86_400_000).toBe(6);
    expect(iso(from)).toBe("2026-01-11");
  });
});

describe("helpers", () => {
  it("addDays crosses a month boundary", () => {
    expect(iso(addDays(new Date(Date.UTC(2026, 8, 30)), 2))).toBe("2026-10-02");
  });

  it("isoDay speaks what a date input and a query string speak", () => {
    expect(isoDay(new Date(Date.UTC(2026, 8, 6)))).toBe("2026-09-06");
  });
});
