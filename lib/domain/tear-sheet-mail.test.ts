import { describe, expect, it } from "vitest";
import { tearSheetMail } from "./tear-sheet-mail";

const item = (date: string) => ({ date, newspaperName: "עיתון השבוע", url: `https://x/${date}` });

describe("the tear sheet mail", () => {
  it("names the one publication in the subject", () => {
    const mail = tearSheetMail({
      businessName: "הוצאת המרכז",
      customerName: "אולמי הדר",
      items: [item("2026-10-13")],
      portalUrl: null,
    });
    expect(mail.subject).toBe("הוכחת פרסום — עיתון השבוע 13.10.2026");
    expect(mail.body).toContain("https://x/2026-10-13");
    expect(mail.body).not.toContain("האזור האישי");
  });

  it("counts several, and lists every link", () => {
    const mail = tearSheetMail({
      businessName: "הוצאת המרכז",
      customerName: "אולמי הדר",
      items: [item("2026-10-13"), item("2026-10-20")],
      portalUrl: "https://x/p/merkaz",
    });
    expect(mail.subject).toBe("הוכחות פרסום — 2 פרסומים");
    expect(mail.body).toContain("https://x/2026-10-20");
    expect(mail.body).toContain("https://x/p/merkaz");
  });
});
