import { describe, expect, it } from "vitest";
import { createZip, readZip } from "./zip";
import { readSheet } from "./sheet";

const enc = (s: string) => new TextEncoder().encode(s);

describe("zip", () => {
  it("round-trips Hebrew names and both stored and deflated entries", () => {
    const zip = createZip([
      { name: "רשימה.csv", data: enc("א,ב\r\n".repeat(50)) },
      { name: "עמוד 02 - לקוח.png", data: new Uint8Array([1, 2, 3]) },
    ]);
    const back = readZip(zip);
    expect(back.map((e) => e.name)).toEqual(["רשימה.csv", "עמוד 02 - לקוח.png"]);
    expect(new TextDecoder().decode(back[0]!.data)).toBe("א,ב\r\n".repeat(50));
    expect([...back[1]!.data]).toEqual([1, 2, 3]);
  });
});

describe("readSheet (xlsx)", () => {
  it("reads shared strings, inline strings and numbers by column letter", () => {
    const xlsx = createZip([
      {
        name: "xl/sharedStrings.xml",
        data: enc('<sst><si><t>שם העסק</t></si><si><r><t>אלפא </t></r><r><t>בע&quot;מ</t></r></si></sst>'),
      },
      {
        name: "xl/worksheets/sheet1.xml",
        data: enc(
          '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="inlineStr"><is><t>טלפון</t></is></c></row>' +
            '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="C2"><v>31234567</v></c></row></sheetData></worksheet>',
        ),
      },
    ]);
    expect(readSheet("לקוחות.xlsx", xlsx)).toEqual([
      ["שם העסק", "", "טלפון"],
      ['אלפא בע"מ', "", "31234567"],
    ]);
  });
});
