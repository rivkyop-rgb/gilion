import { describe, expect, it } from "vitest";
import { mapHeader, parseCustomerRows } from "./customer-import";
import { readCsv } from "@/lib/files/sheet";

describe("mapHeader", () => {
  it("finds columns by Hebrew or English name, in any order", () => {
    expect(mapHeader(["מייל", "שם העסק", "ח.פ"])).toMatchObject({ email: 0, businessName: 1, taxId: 2 });
    expect(mapHeader(["Name", "Phone"])).toMatchObject({ businessName: 0, phone: 1 });
  });
  it("is null when the first row is data", () => {
    expect(mapHeader(["דוגמה בע״מ", "0501234567"])).toBeNull();
  });
});

describe("parseCustomerRows", () => {
  it("validates each row with the form's own rules and keeps Excel's row number", () => {
    const { rows } = parseCustomerRows([
      ["שם העסק", "טלפון", "ח.פ"],
      ["אלפא", "03-1234567", "512345678"],
      ["", "03-1234567", ""],
      ["בטא", "", "12"],
    ]);
    expect(rows[0]).toMatchObject({ line: 2, errors: [] });
    expect(rows[1]!.errors).toContain("שם העסק הוא שדה חובה");
    expect(rows[2]!.line).toBe(4);
    expect(rows[2]!.errors).toContain("ח.פ / ע.מ צריך להיות 9 ספרות");
  });

  it("lifts the contact's phone when the business has none", () => {
    const { rows } = parseCustomerRows([
      ["שם העסק", "איש קשר", "טלפון איש קשר"],
      ["גמא", "דנה", "050-1234567"],
    ]);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.input.phone).toBe("050-1234567");
    expect(rows[0]!.input.contacts?.[0]).toMatchObject({ name: "דנה" });
  });
});

describe("readCsv", () => {
  it("reads quotes, commas inside quotes and semicolon files", () => {
    expect(readCsv('שם,הערות\r\n"לוי, בע""מ",x\r\n')).toEqual([
      ["שם", "הערות"],
      ['לוי, בע"מ', "x"],
    ]);
    expect(readCsv("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});
