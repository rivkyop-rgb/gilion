import { describe, expect, it } from "vitest";
import {
  canCancelOwnRequest,
  pickPageType,
  portalOrderRecord,
  dateError,
  MAX_LINES,
  rejectionReasonToShow,
  validatePortalRequest,
  type PortalNewspaper,
  type PortalRequestLine,
} from "./portal-request";

const TODAY = "2026-09-17";

const weekly: PortalNewspaper = {
  id: "paper_a",
  name: "עיתון השבוע",
  publicationDays: [2], // Tuesday
  maxAdFileSize: 1_000_000,
  shapes: [
    {
      id: "shape_quarter",
      name: "רבע עמוד",
      cols: 13,
      rows: 20,
      pageTypes: [
        { id: "pt_inner", name: "פנימי", priced: true },
        { id: "pt_cover", name: "שער", priced: false },
      ],
    },
  ],
};
const other: PortalNewspaper = {
  ...weekly,
  id: "paper_b",
  name: "אחר",
  publicationDays: [],
  shapes: [],
};

const ok: PortalRequestLine = {
  newspaperId: "paper_a",
  dates: ["2026-09-22"], // a Tuesday
  adShapeId: "shape_quarter",
  advertisementId: "ad_1",
};
const ad = { customerId: "cust_1", fileType: "png", fileSize: 10_000, valid: true };
const ctx = { customerId: "cust_1", today: TODAY };

const fields = (line: PortalRequestLine, a: typeof ad | null = ad, papers = [weekly, other]) =>
  validatePortalRequest([line], papers, new Map(a ? [["ad_1", a]] : []), ctx).map((e) => e.field);

describe("portal request validation (09-customer-portal.md §כללי ולידציה)", () => {
  it("accepts a complete request", () => {
    expect(fields(ok)).toEqual([]);
  });

  it("rule 1 — the newspaper must be one of the business's", () => {
    expect(fields({ ...ok, newspaperId: "paper_of_another_business" })).toContain(
      "lines.0.newspaperId",
    );
  });

  it("rule 2 — at least one date, each valid and not in the past", () => {
    expect(fields({ ...ok, dates: [] })).toContain("lines.0.dates");
    expect(fields({ ...ok, dates: ["22/09/2026"] })).toContain("lines.0.dates");
    expect(fields({ ...ok, dates: ["2026-09-22", "2026-09-15"] })).toContain("lines.0.dates");
  });

  it("rule 2 — a day the paper does not print on is refused, with the paper's days named", () => {
    const errors = validatePortalRequest(
      [{ ...ok, dates: ["2026-09-23"] }],
      [weekly],
      new Map([["ad_1", ad]]),
      ctx,
    );
    expect(errors[0]?.message).toContain("שלישי");
  });

  it("rule 2 — a chag is refused even for a paper with no schedule", () => {
    // 2026-10-03 is Shemini Atzeret / Simchat Torah in Israel.
    expect(dateError("2026-10-03", other, TODAY)).not.toBeNull();
  });

  it("backlog 26 — several dates on one line, and several lines, are one request", () => {
    const lines = [
      { ...ok, dates: ["2026-09-22", "2026-09-29", "2026-10-06"] },
      { ...ok, dates: ["2026-10-13"] },
    ];
    expect(validatePortalRequest(lines, [weekly], new Map([["ad_1", ad]]), ctx)).toEqual([]);
  });

  it("an error names the line it is about", () => {
    const lines = [ok, { ...ok, adShapeId: "nope" }];
    expect(
      validatePortalRequest(lines, [weekly], new Map([["ad_1", ad]]), ctx).map((e) => e.field),
    ).toEqual(["lines.1.adShapeId"]);
  });

  it("refuses an empty request and one past the ceilings", () => {
    expect(validatePortalRequest([], [weekly], new Map(), ctx)[0]?.field).toBe("request");
    const many = Array.from({ length: MAX_LINES + 1 }, () => ok);
    expect(validatePortalRequest(many, [weekly], new Map([["ad_1", ad]]), ctx)[0]?.field).toBe(
      "request",
    );
  });

  it("rule 3 — the size must be one the chosen newspaper sells", () => {
    expect(fields({ ...ok, adShapeId: "shape_from_elsewhere" })).toContain("lines.0.adShapeId");
  });

  it("rule 4 — the file is required, the customer's own, valid, and within THIS line's ceiling", () => {
    expect(fields(ok, null)).toContain("lines.0.advertisementId");
    expect(fields(ok, { ...ad, customerId: "someone_else" })).toContain("lines.0.advertisementId");
    expect(fields(ok, { ...ad, valid: false })).toContain("lines.0.advertisementId");
    expect(fields(ok, { ...ad, fileType: "gif" })).toContain("lines.0.advertisementId");
    expect(fields(ok, { ...ad, fileSize: 1_000_001 })).toContain("lines.0.advertisementId");
  });
});

describe("the record a request becomes (rules 5–7)", () => {
  const line = {
    newspaperId: "paper_a",
    pageTypeId: "pt_inner",
    adShapeId: "shape_quarter",
    dates: ["2026-09-29", "2026-09-22", "2026-09-22"],
    advertisementId: "ad_1",
    listPrice: 450,
  };

  it("is always pending approval and from the portal, and creates no publications", () => {
    const r = portalOrderRecord({ customerId: "cust_1", lines: [line], estimate: 900 });
    expect(r.order.status).toBe("pending_approval");
    expect(r.order.source).toBe("customer_portal");
    expect(r).not.toHaveProperty("publications");
    expect(r.order.total_price).toBe(900);
  });

  it("one item per distinct date, sorted, each carrying its line's file", () => {
    const r = portalOrderRecord({ customerId: "cust_1", lines: [line], estimate: 900 });
    expect(r.items.map((i) => i.publication_date)).toEqual(["2026-09-22", "2026-09-29"]);
    expect(r.items.every((i) => i.advertisement_id === "ad_1")).toBe(true);
  });

  it("one file for the whole request is also the order's; different files are only the lines'", () => {
    expect(
      portalOrderRecord({ customerId: "c", lines: [line], estimate: 0 }).order.advertisement_id,
    ).toBe("ad_1");
    const two = portalOrderRecord({
      customerId: "c",
      lines: [line, { ...line, advertisementId: "ad_2", dates: ["2026-10-06"] }],
      estimate: 0,
    });
    expect(two.order.advertisement_id).toBeNull();
    expect(two.items.map((i) => i.advertisement_id)).toEqual(["ad_1", "ad_1", "ad_2"]);
  });

  it("stores 0 when the newspaper has no price for it, to be completed on approval", () => {
    const r = portalOrderRecord({
      customerId: "c",
      lines: [{ ...line, listPrice: null }],
      estimate: 0,
    });
    expect(r.items[0]!.price).toBe(0);
  });

  it("files the request under a page type that has a price, when one does", () => {
    expect(pickPageType(weekly.shapes[0]!)).toBe("pt_inner");
  });
});

describe("what the customer is shown", () => {
  it("rule 8 — only a pending request can be withdrawn", () => {
    expect(canCancelOwnRequest("pending_approval")).toBe(true);
    for (const s of ["draft", "approved", "rejected", "canceled", "completed"]) {
      expect(canCancelOwnRequest(s)).toBe(false);
    }
  });

  it("rule 9 — a rejection reason shows only when one was given (FR-19)", () => {
    expect(rejectionReasonToShow("rejected", "הקובץ מטושטש")).toBe("הקובץ מטושטש");
    expect(rejectionReasonToShow("rejected", null)).toBeNull();
    expect(rejectionReasonToShow("rejected", "   ")).toBeNull();
    expect(rejectionReasonToShow("approved", "leftover")).toBeNull();
  });
});
