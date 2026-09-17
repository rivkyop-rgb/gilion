import { describe, expect, it } from "vitest";
import {
  canCancelOwnRequest,
  pickPageType,
  portalOrderRecord,
  readSingleDate,
  rejectionReasonToShow,
  validatePortalRequest,
  type PortalNewspaper,
  type PortalRequestInput,
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

const ok: PortalRequestInput = {
  newspaperId: "paper_a",
  publicationDate: "2026-09-22", // a Tuesday
  adShapeId: "shape_quarter",
  advertisementId: "ad_1",
};
const ad = { customerId: "cust_1", fileType: "png", fileSize: 10_000, valid: true };
const ctx = { customerId: "cust_1", today: TODAY };

const fields = (input: PortalRequestInput, a = ad as typeof ad | null) =>
  validatePortalRequest(input, [weekly, other], a, ctx).map((e) => e.field);

describe("portal request validation (09-customer-portal.md §כללי ולידציה)", () => {
  it("accepts a complete request", () => {
    expect(fields(ok)).toEqual([]);
  });

  it("rule 1 — the newspaper must be one of the business's", () => {
    expect(fields({ ...ok, newspaperId: "paper_of_another_business" })).toContain("newspaperId");
  });

  it("rule 2 — one date, required, valid, not in the past", () => {
    expect(fields({ ...ok, publicationDate: "" })).toContain("publicationDate");
    expect(fields({ ...ok, publicationDate: "22/09/2026" })).toContain("publicationDate");
    expect(fields({ ...ok, publicationDate: "2026-09-15" })).toContain("publicationDate");
  });

  it("rule 2 — a day the paper does not print on is refused, with the paper's days named", () => {
    const errors = validatePortalRequest(
      { ...ok, publicationDate: "2026-09-23" },
      [weekly],
      ad,
      ctx,
    );
    expect(errors[0]?.message).toContain("שלישי");
  });

  it("rule 2 — a chag is refused even for a paper with no schedule", () => {
    // 2026-10-03 is Shemini Atzeret / Simchat Torah in Israel.
    const errors = validatePortalRequest(
      { ...ok, newspaperId: "paper_b", publicationDate: "2026-10-03", adShapeId: "x" },
      [{ ...other, shapes: [{ ...weekly.shapes[0]!, id: "x" }] }],
      ad,
      ctx,
    );
    expect(errors.map((e) => e.field)).toContain("publicationDate");
  });

  it("rule 2 — two dates in one POST are not quietly reduced to one", () => {
    expect(readSingleDate(["2026-09-22"])).toBe("2026-09-22");
    expect(readSingleDate(["2026-09-22", "2026-09-29"])).toBeNull();
    expect(readSingleDate([])).toBeNull();
  });

  it("rule 3 — the size must be one the chosen newspaper sells", () => {
    expect(fields({ ...ok, adShapeId: "shape_from_elsewhere" })).toContain("adShapeId");
  });

  it("rule 4 — the file is required, the customer's own, valid, and within THIS paper's ceiling", () => {
    expect(fields(ok, null)).toContain("advertisementId");
    expect(fields(ok, { ...ad, customerId: "someone_else" })).toContain("advertisementId");
    expect(fields(ok, { ...ad, valid: false })).toContain("advertisementId");
    expect(fields(ok, { ...ad, fileType: "gif" })).toContain("advertisementId");
    expect(fields(ok, { ...ad, fileSize: 1_000_001 })).toContain("advertisementId");
  });
});

describe("the record a request becomes (rules 5–7)", () => {
  const base = {
    customerId: "cust_1",
    advertisementId: "ad_1",
    newspaperId: "paper_a",
    pageTypeId: "pt_inner",
    adShapeId: "shape_quarter",
    publicationDate: "2026-09-22",
  };

  it("is always pending approval and from the portal, with exactly one line and no publications", () => {
    const r = portalOrderRecord({ ...base, listPrice: 450 });
    expect(r.order.status).toBe("pending_approval");
    expect(r.order.source).toBe("customer_portal");
    expect(r.item.publication_date).toBe("2026-09-22");
    expect(r).not.toHaveProperty("publications");
    expect(r.order.total_price).toBe(450);
  });

  it("stores 0 when the newspaper has no price for it, to be completed on approval", () => {
    const r = portalOrderRecord({ ...base, listPrice: null });
    expect(r.item.price).toBe(0);
    expect(r.order.total_price).toBe(0);
  });

  it("files the request under a page type that has a price, when one does", () => {
    expect(pickPageType(weekly.shapes[0]!)).toBe("pt_inner");
    expect(
      pickPageType({
        ...weekly.shapes[0]!,
        pageTypes: weekly.shapes[0]!.pageTypes.map((p) => ({ ...p, priced: false })),
      }),
    ).toBe("pt_inner"); // "פנימי" before "שער"
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
