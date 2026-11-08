import { describe, expect, it } from "vitest";
import { buildStatementHtml } from "./statement-html";

describe("buildStatementHtml", () => {
  it("escapes names and says what is due now", () => {
    const html = buildStatementHtml({
      businessName: "מקומון <ב>",
      businessContact: null,
      customerName: 'לוי בע"מ',
      customerTaxId: null,
      issuedOn: "8.11.2026",
      rows: [{ date: "19.11.2026", newspaper: "מקומון", shape: "חצי", order: "ORD-0002", ran: true, price: "₪1,870.00", covered: "₪1,000.00", open: "₪870.00" }],
      payments: [],
      summary: { billed: "₪1,870.00", settled: "₪1,000.00", outstanding: "₪870.00", ranOpen: "₪870.00", upcomingOpen: "₪0.00", credit: null },
    });
    expect(html).toContain("מקומון &lt;ב&gt;");
    expect(html).toContain("לתשלום עכשיו");
    expect(html).toContain('dir="rtl"');
  });

  it("prints the business's logo only when it is an image data URI", () => {
    const base = {
      businessName: "מקומון",
      businessContact: null,
      customerName: "לקוח",
      customerTaxId: null,
      issuedOn: "8.11.2026",
      rows: [],
      payments: [],
      summary: { billed: "₪0", settled: "₪0", outstanding: "₪0", ranOpen: "₪0", upcomingOpen: "₪0", credit: null },
    };
    expect(buildStatementHtml({ ...base, logo: "data:image/png;base64,AAAA" })).toContain(
      '<img class="logo" src="data:image/png;base64,AAAA"',
    );
    expect(buildStatementHtml({ ...base, logo: null })).not.toContain('class="logo"');
    expect(buildStatementHtml({ ...base, logo: "https://evil.example/x.png" })).not.toContain("evil");
  });
});
