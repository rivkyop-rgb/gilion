import { describe, expect, it } from "vitest";

import { jewishDay } from "./jewish-calendar";
import {
  describeDate,
  isUsableDate,
  nextIssueDate,
  notesFor,
  upcomingIssueDates,
} from "./issue-schedule";

/** Tuesdays — the seeded newspaper's schedule (prisma/seed.ts). */
const TUESDAYS = [2];

describe("what is worth saying about a date", () => {
  it("says nothing about an ordinary printing day", () => {
    // 2026-09-08 is a Tuesday and no holiday.
    expect(notesFor("2026-09-08", TUESDAYS)).toEqual([]);
    expect(describeDate("2026-09-08", TUESDAYS).usable).toBe(true);
  });

  it("flags a date the newspaper does not print on", () => {
    // A Sunday, for a paper that prints on Tuesdays.
    const notes = notesFor("2026-09-06", TUESDAYS);
    expect(notes.map((n) => n.kind)).toEqual(["off_schedule"]);
    // Off schedule is a decision, not a refusal.
    expect(isUsableDate(notes)).toBe(true);
  });

  it("says nothing about the schedule when the newspaper declares none", () => {
    // An empty list means "no schedule declared", which is not "never prints".
    expect(notesFor("2026-09-06", [])).toEqual([]);
  });

  it("refuses yom tov, because nobody is at the press", () => {
    const chag = findDay("chag");
    const notes = notesFor(chag, TUESDAYS);
    expect(notes.some((n) => n.kind === "no_paper")).toBe(true);
    expect(isUsableDate(notes)).toBe(false);
  });

  it("flags the eve of a chag without blocking it", () => {
    // The paper comes out, and it is the issue people fight over — so this is
    // something to SAY, never something to stop.
    const erev = findDay("erev_chag");
    const notes = notesFor(erev, []);
    expect(notes.some((n) => n.kind === "erev_chag")).toBe(true);
    expect(isUsableDate(notes)).toBe(true);
  });
});

describe("the next issue's date", () => {
  it("is the next day the newspaper prints on", () => {
    // 2026-09-01 is a Tuesday; the next Tuesday is the 8th.
    expect(nextIssueDate("2026-09-01", TUESDAYS)?.date).toBe("2026-09-08");
  });

  it("never lands on yom tov", () => {
    // Walked from a year of Tuesdays, no suggestion may be a chag.
    let cursor = "2026-09-01";
    for (let i = 0; i < 52; i++) {
      const next = nextIssueDate(cursor, TUESDAYS);
      expect(next).not.toBeNull();
      expect(jewishDay(next!.date)?.kind).not.toBe("chag");
      cursor = next!.date;
    }
  });

  it("has nothing to compute from when the newspaper declares no schedule", () => {
    // Guessing "a week later" would be inventing a policy nobody stated.
    expect(nextIssueDate("2026-09-01", [])).toBeNull();
  });

  it("refuses a date it cannot parse", () => {
    expect(nextIssueDate("not-a-date", TUESDAYS)).toBeNull();
  });

  it("offers a short list to choose from, in order", () => {
    const upcoming = upcomingIssueDates("2026-09-01", TUESDAYS, 3);
    expect(upcoming).toHaveLength(3);
    expect(upcoming.map((u) => u.date)).toEqual([...upcoming.map((u) => u.date)].sort());
    expect(upcoming[0]!.date).toBe("2026-09-08");
    expect(upcoming.every((u) => u.usable)).toBe(true);
  });

  it("offers nothing without a schedule", () => {
    expect(upcomingIssueDates("2026-09-01", [])).toEqual([]);
  });
});

/** The first day of the given kind in the year ahead — dates move each year. */
function findDay(kind: "chag" | "erev_chag"): string {
  const start = new Date("2026-09-01T00:00:00.000Z");
  for (let i = 0; i < 400; i++) {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + i);
    const date = day.toISOString().slice(0, 10);
    if (jewishDay(date)?.kind === kind) return date;
  }
  throw new Error(`no ${kind} found in the year ahead`);
}
