import { describe, expect, it } from "vitest";
import {
  contactsToStorage,
  deletionBlockedMessage,
  normalizeEmail,
  normalizePhone,
  normalizeTaxId,
  toStorage,
  validateCustomer,
  type CustomerInput,
} from "./customer";

const base: CustomerInput = {
  businessName: "מרכז הרפואה",
  phone: "052-123-4567",
};

const errorFor = (input: Partial<CustomerInput>) =>
  validateCustomer({ ...base, ...input }).map((e) => e.message);

describe("rule 1 — every customer is a business with a name", () => {
  it("rejects an empty business name", () => {
    expect(errorFor({ businessName: "" })).toContain("שם העסק הוא שדה חובה");
  });

  it("rejects whitespace only", () => {
    expect(errorFor({ businessName: "   " })).toContain("שם העסק הוא שדה חובה");
  });

  it("accepts a Hebrew name", () => {
    expect(validateCustomer(base)).toEqual([]);
  });

  it("needs no contact person", () => {
    expect(validateCustomer({ ...base, contacts: [] })).toEqual([]);
  });
});

describe("rule 2 — the business's phone or email is required", () => {
  it("rejects when both are missing", () => {
    expect(errorFor({ phone: null, email: null })).toContain("יש להזין טלפון או מייל של העסק");
  });

  it("accepts phone alone", () => {
    expect(validateCustomer({ ...base, email: null })).toEqual([]);
  });

  it("accepts email alone", () => {
    expect(validateCustomer({ ...base, phone: null, email: "noa@example.com" })).toEqual([]);
  });
});

describe("rule 3 — ח.פ / ע.מ is optional, and nine digits when given", () => {
  it("accepts no number at all", () => {
    expect(validateCustomer({ ...base, taxId: "" })).toEqual([]);
  });

  it.each(["515555555", "51-555555-5", "515 555 555"])("accepts %s as 515555555", (raw) => {
    expect(normalizeTaxId(raw)).toBe("515555555");
    expect(validateCustomer({ ...base, taxId: raw })).toEqual([]);
  });

  it.each(["12345", "1234567890", "abc"])("rejects %s", (raw) => {
    expect(errorFor({ taxId: raw })).toContain("ח.פ / ע.מ צריך להיות 9 ספרות");
  });
});

describe("rule 4 — Israeli phone format", () => {
  it.each(["052-123-4567", "052 123 4567", "0521234567", "+972521234567", "(052) 1234567"])(
    "accepts %s and normalises it to 0521234567",
    (raw) => {
      expect(normalizePhone(raw)).toBe("0521234567");
      expect(validateCustomer({ ...base, phone: raw })).toEqual([]);
    },
  );

  it.each(["12345", "05212345678901", "לא-מספר"])("rejects %s", (raw) => {
    expect(errorFor({ phone: raw })).toContain("מספר טלפון לא תקין — יש להזין 9 או 10 ספרות");
  });

  it("treats an empty string as absent, not as invalid", () => {
    expect(normalizePhone("")).toBeNull();
  });
});

describe("rule 5 — email format and normalisation", () => {
  it("rejects a malformed address", () => {
    expect(errorFor({ email: "noa@bad" })).toContain("כתובת מייל לא תקינה");
  });

  it("lowercases and trims, so casing cannot create a duplicate", () => {
    expect(normalizeEmail("  Noa@Example.COM ")).toBe("noa@example.com");
  });
});

describe("reports every problem at once", () => {
  it("returns every error for an empty customer with a bad number", () => {
    const errors = validateCustomer({ businessName: "", taxId: "1", phone: null, email: null });
    expect(errors.map((e) => e.field).sort()).toEqual(["businessName", "phone", "taxId"]);
  });
});

describe("rule 8 — deletion is blocked by history", () => {
  it("allows deletion when nothing references the customer", () => {
    expect(deletionBlockedMessage({ orders: 0, publications: 0 })).toBeNull();
  });

  it("names what blocks it, and how many", () => {
    const msg = deletionBlockedMessage({ orders: 3, publications: 12, advertisements: 0 });
    expect(msg).toContain("3 הזמנות");
    expect(msg).toContain("12 פרסומים");
    expect(msg).not.toContain("מודעות");
  });

  // Exactly one is the count a fixture built from three of everything never
  // produces — and the count a customer someone actually tries to delete has.
  it("says הזמנה אחת, never 1 הזמנות", () => {
    const msg = deletionBlockedMessage({ orders: 1 });
    expect(msg).toContain("הזמנה אחת");
    expect(msg).not.toContain("1 ");
  });

  it("blocks on an advertisement or a payment alone — both are onDelete: Restrict", () => {
    expect(deletionBlockedMessage({ advertisements: 1 })).toContain("מודעה אחת");
    expect(deletionBlockedMessage({ payments: 2 })).toContain("2 רישומי תשלום");
  });
});

describe("toStorage", () => {
  it("normalises phone and email on the way to the database", () => {
    expect(
      toStorage({
        businessName: "  מרכז הרפואה  ",
        taxId: "51-555555-5",
        phone: "052-123-4567",
        email: " Noa@Example.com ",
      }),
    ).toEqual({
      business_name: "מרכז הרפואה",
      tax_id: "515555555",
      phone: "0521234567",
      email: "noa@example.com",
      notes: null,
      preferred_page: null,
    });
  });
});

describe("contacts", () => {
  it("drops a row left completely blank instead of refusing it", () => {
    const contacts = [{ name: " ", role: "", phone: "", email: "" }];
    expect(validateCustomer({ ...base, contacts })).toEqual([]);
    expect(contactsToStorage(contacts)).toEqual([]);
  });

  it("requires a name on a row that has anything else", () => {
    const errors = validateCustomer({ ...base, contacts: [{ name: "", role: "הנה״ח" }] });
    expect(errors).toEqual([{ field: "contacts", message: "חסר שם באיש הקשר ה־1" }]);
  });

  it("checks phone and email the same way the main contact is checked", () => {
    expect(
      validateCustomer({ ...base, contacts: [{ name: "רון", phone: "123" }] })[0]?.message,
    ).toBe("מספר טלפון לא תקין באיש הקשר ה־1");
    expect(
      validateCustomer({ ...base, contacts: [{ name: "רון", email: "x@" }] })[0]?.message,
    ).toBe("כתובת מייל לא תקינה באיש הקשר ה־1");
  });

  it("stores normalised values, numbered in the order entered", () => {
    expect(
      contactsToStorage([
        { name: " רון ", role: " הנהלת חשבונות ", phone: "052-123-4567", email: "RON@X.CO.IL" },
        { name: "", role: "", phone: "", email: "" },
        { name: "מיכל", role: "", phone: null, email: null },
      ]),
    ).toEqual([
      {
        name: "רון",
        role: "הנהלת חשבונות",
        phone: "0521234567",
        email: "ron@x.co.il",
        receives_reminders: false,
        receives_tear_sheets: false,
        receives_billing: false,
        position: 0,
      },
      {
        name: "מיכל",
        role: null,
        phone: null,
        email: null,
        receives_reminders: false,
        receives_tear_sheets: false,
        receives_billing: false,
        position: 1,
      },
    ]);
  });
});
