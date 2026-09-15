import { describe, expect, it } from "vitest";

import {
  INVOICE_NUMBER_MAX,
  validateAmount,
  validateInvoiceNumber,
  validatePayment,
  validatePaymentDate,
  paymentsPhrase,
} from "./payment";

/** A fixed "now" so the future/past boundary is not a moving target. */
const TODAY = new Date("2026-09-14T09:00:00Z");

describe("rule 1 — amount is positive", () => {
  it("accepts an ordinary amount", () => {
    expect(validateAmount(1500)).toBeNull();
    expect(validateAmount(0.5)).toBeNull();
  });

  it("refuses zero and negatives, and says what to do instead", () => {
    expect(validateAmount(0)).toContain("גדול מאפס");
    expect(validateAmount(-100)).toContain("לבטל את הרישום");
  });

  it("refuses a blank or unparsable field", () => {
    expect(validateAmount(Number.NaN)).toBe("יש להקליד סכום");
  });

  it("refuses more than two decimals — a shekel has two", () => {
    expect(validateAmount(10.123)).toContain("שתי ספרות");
  });
});

describe("rule 3 — payment date is not in the future", () => {
  it("accepts an empty date: the ERD makes it optional", () => {
    expect(validatePaymentDate("", TODAY)).toBeNull();
  });

  it("accepts today and the past", () => {
    expect(validatePaymentDate("2026-09-14", TODAY)).toBeNull();
    expect(validatePaymentDate("2020-01-01", TODAY)).toBeNull();
  });

  it("refuses tomorrow", () => {
    expect(validatePaymentDate("2026-09-15", TODAY)).toContain("בעתיד");
  });

  it("compares calendar days in Jerusalem, not UTC instants", () => {
    // 23:30 in Jerusalem on the 14th is already the 15th in UTC. Typing today's
    // date must not be refused as the future.
    const lateEvening = new Date("2026-09-14T20:30:00Z");
    expect(validatePaymentDate("2026-09-14", lateEvening)).toBeNull();
  });

  it("refuses text that is not a date", () => {
    expect(validatePaymentDate("14/09/2026", TODAY)).toBe("תאריך לא תקין");
  });
});

describe("rule 4 — invoice number is free text", () => {
  it("accepts anything a person might type, including letters and dashes", () => {
    expect(validateInvoiceNumber("INV-2026-081")).toBeNull();
    expect(validateInvoiceNumber("חשבונית 14")).toBeNull();
    expect(validateInvoiceNumber("")).toBeNull();
  });

  it("refuses only a value too long to be a label", () => {
    expect(validateInvoiceNumber("x".repeat(INVOICE_NUMBER_MAX))).toBeNull();
    expect(validateInvoiceNumber("x".repeat(INVOICE_NUMBER_MAX + 1))).toContain("ארוך");
  });
});

describe("validatePayment", () => {
  it("passes a complete, valid record", () => {
    expect(
      validatePayment(
        { amount: 1200, paymentDate: "2026-09-01", externalInvoiceNumber: "INV-9" },
        TODAY,
      ),
    ).toBeNull();
  });

  it("reports the amount first — it is the field a person fills first", () => {
    expect(
      validatePayment(
        { amount: -5, paymentDate: "2099-01-01", externalInvoiceNumber: "x".repeat(200) },
        TODAY,
      ),
    ).toContain("גדול מאפס");
  });
});

describe("paymentsPhrase", () => {
  it("agrees with the number — one is the case fixtures never produce", () => {
    expect(paymentsPhrase(1)).toBe("תשלום אחד");
    expect(paymentsPhrase(3)).toBe("3 תשלומים");
    expect(paymentsPhrase(0)).toBe("0 תשלומים");
  });
});
