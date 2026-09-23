import { describe, expect, it } from "vitest";
import {
  assertConvertible,
  contactsToStorage,
  deletionBlockedMessage,
  InvalidConversionError,
  normalizeEmail,
  normalizePhone,
  toStorage,
  validateCustomer,
  type CustomerInput,
} from "./customer";

const base: CustomerInput = {
  customerType: "casual",
  contactName: "נועה כהן",
  phone: "052-123-4567",
};

const errorFor = (input: Partial<CustomerInput>) =>
  validateCustomer({ ...base, ...input }).map((e) => e.message);

describe("rule 1 — contact name is required (US-002)", () => {
  it("rejects an empty name", () => {
    expect(errorFor({ contactName: "" })).toContain("שם איש קשר הוא שדה חובה");
  });

  it("rejects whitespace only", () => {
    expect(errorFor({ contactName: "   " })).toContain("שם איש קשר הוא שדה חובה");
  });

  it("accepts a Hebrew name", () => {
    expect(validateCustomer(base)).toEqual([]);
  });
});

describe("rule 2 — phone or email is required (US-002)", () => {
  it("rejects when both are missing", () => {
    expect(errorFor({ phone: null, email: null })).toContain("יש להזין טלפון או כתובת מייל");
  });

  it("accepts phone alone", () => {
    expect(validateCustomer({ ...base, email: null })).toEqual([]);
  });

  it("accepts email alone", () => {
    expect(validateCustomer({ ...base, phone: null, email: "noa@example.com" })).toEqual([]);
  });

  it("applies to regular customers too, not just casual", () => {
    expect(
      errorFor({ customerType: "regular", businessName: "מרכז הרפואה", phone: null, email: null }),
    ).toContain("יש להזין טלפון או כתובת מייל");
  });
});

describe("rule 3 — a regular customer needs a business name", () => {
  it("rejects a regular customer without one", () => {
    expect(errorFor({ customerType: "regular", businessName: "" })).toContain(
      "שם העסק הוא שדה חובה ללקוח קבוע",
    );
  });

  it("does not require it for a casual customer", () => {
    expect(validateCustomer({ ...base, businessName: "" })).toEqual([]);
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
  it("returns three errors for a fully empty regular customer", () => {
    const errors = validateCustomer({
      customerType: "regular",
      contactName: "",
      businessName: "",
      phone: null,
      email: null,
    });
    expect(errors).toHaveLength(3);
    expect(errors.map((e) => e.field).sort()).toEqual(["businessName", "contactName", "phone"]);
  });
});

describe("rule 6 — conversion is one-way", () => {
  it("allows casual → regular with a business name", () => {
    expect(() => assertConvertible("casual", "regular", "מרכז הרפואה")).not.toThrow();
  });

  it("refuses casual → regular without a business name", () => {
    expect(() => assertConvertible("casual", "regular", "  ")).toThrow(InvalidConversionError);
  });

  it("refuses regular → casual — the history was produced against a business", () => {
    expect(() => assertConvertible("regular", "casual", "x")).toThrow(
      "לא ניתן להפוך לקוח קבוע ללקוח מזדמן",
    );
  });

  it("refuses converting to the type it already is", () => {
    expect(() => assertConvertible("casual", "casual", "x")).toThrow("הלקוח כבר מסוג זה");
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
        customerType: "regular",
        businessName: "  מרכז הרפואה  ",
        contactName: "  נועה  ",
        phone: "052-123-4567",
        email: " Noa@Example.com ",
      }),
    ).toEqual({
      customer_type: "regular",
      business_name: "מרכז הרפואה",
      contact_name: "נועה",
      phone: "0521234567",
      email: "noa@example.com",
      notes: null,
    });
  });

  it("keeps a casual customer's optional business name as null when blank", () => {
    expect(toStorage({ ...base, businessName: "   " }).business_name).toBeNull();
  });
});

describe("additional contacts", () => {
  const base = { customerType: "casual" as const, contactName: "דנה", phone: "0521234567" };

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
        position: 0,
      },
      { name: "מיכל", role: null, phone: null, email: null, position: 1 },
    ]);
  });
});
