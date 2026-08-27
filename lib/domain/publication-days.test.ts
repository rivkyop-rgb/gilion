import { describe, expect, it } from "vitest";
import {
  formatDays,
  hasSchedule,
  isPublicationDay,
  monthDays,
  normalizeDays,
  offScheduleWarning,
  todayIso,
  weekdayOf,
} from "./publication-days";

describe("normalizeDays", () => {
  it("sorts, de-duplicates and drops out-of-range values", () => {
    expect(normalizeDays([3, 0, 3, 7, -1, 6, 2.5])).toEqual([0, 3, 6]);
  });
});

describe("weekdayOf", () => {
  it("reads the weekday in local time, not UTC", () => {
    // 2026-08-25 is a Tuesday. Parsed as UTC midnight it reports Monday in any
    // negative-offset zone, which is the bug this function exists to avoid.
    expect(weekdayOf("2026-08-25")).toBe(2);
  });

  it("rejects malformed and impossible dates", () => {
    expect(weekdayOf("25/08/2026")).toBeNull();
    expect(weekdayOf("2026-02-31")).toBeNull();
    expect(weekdayOf("")).toBeNull();
  });
});

describe("isPublicationDay", () => {
  it("passes everything when no schedule is declared", () => {
    expect(hasSchedule([])).toBe(false);
    expect(isPublicationDay([], "2026-08-25")).toBe(true);
  });

  it("matches only the declared weekdays", () => {
    expect(isPublicationDay([2], "2026-08-25")).toBe(true); // Tuesday
    expect(isPublicationDay([2], "2026-08-26")).toBe(false); // Wednesday
  });

  it("treats an unparseable date as not a publication day", () => {
    expect(isPublicationDay([2], "nonsense")).toBe(false);
  });
});

describe("formatDays", () => {
  it("names the days in Hebrew", () => {
    expect(formatDays([])).toBe("לא הוגדרו ימי הדפסה");
    expect(formatDays([2])).toBe("יום שלישי");
    expect(formatDays([0, 4])).toBe("ימי ראשון וחמישי");
    expect(formatDays([0, 2, 4])).toBe("ימי ראשון, שלישי וחמישי");
  });
});

describe("offScheduleWarning", () => {
  it("is null on a scheduled day", () => {
    expect(offScheduleWarning([2], "2026-08-25", "עיתון השבוע")).toBeNull();
  });

  it("names the day, the paper and the schedule", () => {
    const msg = offScheduleWarning([2], "2026-08-26", "עיתון השבוע");
    expect(msg).toContain("רביעי");
    expect(msg).toContain("עיתון השבוע");
    expect(msg).toContain("יום שלישי");
  });
});

describe("monthDays", () => {
  it("covers the whole month and marks print days", () => {
    const days = monthDays(2026, 7, [2], "2026-08-25"); // August 2026
    expect(days).toHaveLength(31);
    expect(days[0]!.iso).toBe("2026-08-01");
    expect(days.filter((d) => d.isPublicationDay).map((d) => d.day)).toEqual([4, 11, 18, 25]);
  });

  it("marks days before today as past", () => {
    const days = monthDays(2026, 7, [2], "2026-08-25");
    expect(days.find((d) => d.day === 24)!.isPast).toBe(true);
    expect(days.find((d) => d.day === 25)!.isPast).toBe(false);
  });

  it("handles February in a leap year", () => {
    expect(monthDays(2028, 1, [], "2028-01-01")).toHaveLength(29);
  });
});

describe("todayIso", () => {
  it("formats the local date, not the UTC one", () => {
    // 23:30 local on the 25th is the 26th in UTC; the local answer must win.
    expect(todayIso(new Date(2026, 7, 25, 23, 30))).toBe("2026-08-25");
  });
});
