import { describe, expect, it } from "vitest";
import { emailHref, gmailHref, mailtoHref } from "./mail-link";

describe("email links", () => {
  it("Gmail opens compose, addressed, with subject and body", () => {
    const href = gmailHref("a@b.co.il", "תזכורת", "שלום,\nתודה");
    const url = new URL(href);
    expect(url.origin + url.pathname).toBe("https://mail.google.com/mail/");
    expect(url.searchParams.get("view")).toBe("cm");
    expect(url.searchParams.get("to")).toBe("a@b.co.il");
    expect(url.searchParams.get("su")).toBe("תזכורת");
    expect(url.searchParams.get("body")).toBe("שלום,\nתודה");
  });

  it("keeps spaces as spaces, not '+', in both", () => {
    expect(mailtoHref("a@b.co.il", "שתי מילים")).not.toContain("+");
    expect(gmailHref("a@b.co.il", "שתי מילים", "גוף ההודעה")).not.toContain("+");
  });

  it("follows the business's choice", () => {
    expect(emailHref("gmail", "a@b.co.il")).toMatch(/^https:\/\/mail\.google\.com/);
    expect(emailHref("mailto", "a@b.co.il")).toBe("mailto:a@b.co.il");
  });
});
