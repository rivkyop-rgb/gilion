import { describe, expect, it } from "vitest";

import {
  daysLabel,
  daysUntil,
  dueReminders,
  needsReminder,
  reminderResolved,
  urgency,
  validateReminderDays,
  type ReminderCandidate,
} from "./reminders";

const TODAY = new Date("2026-09-01T10:30:00Z");

const at = (iso: string, over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  publicationId: `pub-${iso}`,
  customerId: "cust1",
  publicationDate: new Date(`${iso}T00:00:00Z`),
  status: "planned",
  hasAdvertisement: false,
  ...over,
});

describe("daysUntil", () => {
  it("counts whole calendar days, not hours", () => {
    // 10:30 on the day itself is still "today", not "yesterday".
    expect(daysUntil(new Date("2026-09-01T00:00:00Z"), TODAY)).toBe(0);
    expect(daysUntil(new Date("2026-09-02T00:00:00Z"), TODAY)).toBe(1);
    expect(daysUntil(new Date("2026-09-08T00:00:00Z"), TODAY)).toBe(7);
  });

  it("goes negative for a date that has passed", () => {
    expect(daysUntil(new Date("2026-08-30T00:00:00Z"), TODAY)).toBe(-2);
  });
});

describe("needsReminder", () => {
  it("is due inside the window with no artwork", () => {
    expect(needsReminder(at("2026-09-05"), 7, TODAY)).toBe(true);
  });

  it("is not due outside the window", () => {
    expect(needsReminder(at("2026-09-20"), 7, TODAY)).toBe(false);
  });

  it("is due exactly on the window edge", () => {
    expect(needsReminder(at("2026-09-08"), 7, TODAY)).toBe(true);
    expect(needsReminder(at("2026-09-09"), 7, TODAY)).toBe(false);
  });

  it("keeps asking after the date has passed", () => {
    // Missing the deadline is the reason to shout, not to go quiet.
    expect(needsReminder(at("2026-08-25"), 7, TODAY)).toBe(true);
  });

  it("is never due once a file is attached", () => {
    expect(needsReminder(at("2026-09-05", { hasAdvertisement: true }), 7, TODAY)).toBe(false);
  });

  it("is never due for a cancelled publication", () => {
    expect(needsReminder(at("2026-09-05", { status: "canceled" }), 7, TODAY)).toBe(false);
  });

  it("stops once artwork has been received, even before it is placeable", () => {
    // Chasing someone for a file they already sent is how a list loses trust.
    expect(needsReminder(at("2026-09-05", { status: "ad_received" }), 7, TODAY)).toBe(false);
  });

  it("respects a window the business widened or narrowed", () => {
    const candidate = at("2026-09-20");
    expect(needsReminder(candidate, 7, TODAY)).toBe(false);
    expect(needsReminder(candidate, 30, TODAY)).toBe(true);
  });
});

describe("dueReminders", () => {
  it("returns only the publications that qualify", () => {
    const due = dueReminders(
      [
        at("2026-09-03"),
        at("2026-09-04", { hasAdvertisement: true }),
        at("2026-09-30"),
        at("2026-09-02", { status: "canceled" }),
      ],
      7,
      TODAY,
    );
    expect(due.map((d) => d.publicationId)).toEqual(["pub-2026-09-03"]);
  });
});

describe("reminderResolved", () => {
  it("is resolved as soon as a file is attached (rule 7)", () => {
    expect(reminderResolved(at("2026-09-03", { hasAdvertisement: true }))).toBe(true);
    expect(reminderResolved(at("2026-09-03"))).toBe(false);
  });

  it("is resolved when the publication is cancelled", () => {
    expect(reminderResolved(at("2026-09-03", { status: "canceled" }))).toBe(true);
  });
});

describe("validateReminderDays", () => {
  it("accepts a sane window", () => {
    expect(validateReminderDays(7)).toBeNull();
    expect(validateReminderDays(1)).toBeNull();
    expect(validateReminderDays(60)).toBeNull();
  });

  it("refuses zero, negatives, fractions and absurd windows", () => {
    expect(validateReminderDays(0)).not.toBeNull();
    expect(validateReminderDays(-1)).not.toBeNull();
    expect(validateReminderDays(2.5)).not.toBeNull();
    expect(validateReminderDays(61)).not.toBeNull();
  });
});

describe("urgency and labels", () => {
  it("separates overdue from urgent from merely soon", () => {
    expect(urgency(-1)).toBe("overdue");
    expect(urgency(0)).toBe("urgent");
    expect(urgency(3)).toBe("urgent");
    expect(urgency(4)).toBe("soon");
  });

  it("reads naturally in Hebrew", () => {
    expect(daysLabel(0)).toBe("היום");
    expect(daysLabel(1)).toBe("מחר");
    expect(daysLabel(5)).toBe("בעוד 5 ימים");
    expect(daysLabel(-2)).toBe("עבר לפני 2 ימים");
  });
});
