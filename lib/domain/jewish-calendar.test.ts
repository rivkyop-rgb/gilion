import { describe, expect, it } from "vitest";
import { isNoPaperDay, jewishDay, jewishMonth, noPaperReason } from "./jewish-calendar";

describe("jewishDay — the Hebrew date", () => {
  it("writes the day in gematria, not in Latin digits", () => {
    // The bug this module exists for: Intl rendered this as "14 באלול".
    expect(jewishDay("2026-08-27")!.hebrew).toBe("י״ד אלול");
  });

  it("uses gematria for the teens and the twenties too", () => {
    expect(jewishDay("2026-09-12")!.hebrew).toBe("א׳ תשרי");
    expect(jewishDay("2026-09-21")!.hebrew).toBe("י׳ תשרי");
  });

  it("returns null for a date that is not a date", () => {
    expect(jewishDay("2026-02-31")).toBeNull();
    expect(jewishDay("27/08/2026")).toBeNull();
  });
});

describe("chag — no newspaper", () => {
  it("marks Rosh Hashana, Yom Kippur and the first day of Sukkot", () => {
    for (const iso of ["2026-09-12", "2026-09-21", "2026-09-26"]) {
      expect(isNoPaperDay(iso)).toBe(true);
      expect(jewishDay(iso)!.kind).toBe("chag");
    }
  });

  it("gives a reason a person can read", () => {
    expect(noPaperReason("2026-09-21")).toContain("לא יוצא עיתון בחג");
    expect(noPaperReason("2026-09-21")).toContain("כִּפּוּר");
  });

  it("does NOT close chol hamoed — the paper comes out then", () => {
    // 2026-10-01 is Sukkot 6, chol hamoed.
    expect(isNoPaperDay("2026-10-01")).toBe(false);
    expect(jewishDay("2026-10-01")!.kind).toBe("chol_hamoed");
  });

  it("does not close an ordinary weekday", () => {
    expect(isNoPaperDay("2026-08-27")).toBe(false);
    expect(noPaperReason("2026-08-27")).toBeNull();
  });
});

describe("erev chag — the days a customer actually wants", () => {
  it("marks the eve of Rosh Hashana, Yom Kippur and Sukkot", () => {
    for (const iso of ["2026-09-11", "2026-09-20", "2026-09-25"]) {
      expect(jewishDay(iso)!.kind).toBe("erev_chag");
      expect(isNoPaperDay(iso)).toBe(false);
    }
  });
});

describe("jewishMonth", () => {
  it("covers every day of the month", () => {
    expect(jewishMonth(2026, 8).size).toBe(30); // September
    expect(jewishMonth(2026, 7).size).toBe(31); // August
    expect(jewishMonth(2028, 1).size).toBe(29); // leap February
  });

  it("agrees with jewishDay for the same date", () => {
    const m = jewishMonth(2026, 8);
    expect(m.get("2026-09-21")).toEqual(jewishDay("2026-09-21"));
  });
});
