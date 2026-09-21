import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { basePrisma } from "./db";
import { nextOrderNumber } from "./orders";
import { isExclusionViolation } from "./placements";

/**
 * FR-16 / conventions.md §4, asserted where the guarantee actually lives.
 *
 * A browser cannot prove this. Two clicks in two tabs are only ever PROBABLY
 * simultaneous, and a test that is probably a race is a flake with a
 * reassuring name. Two transactions issued together against the same page are
 * a real race, every time, and the thing being proved — that Postgres refuses
 * the second one — is a property of the database and not of the UI.
 *
 * The two rules also fail DIFFERENTLY, which is the detail that made this
 * worth pinning: the exclusion constraint raises 23P01 and Prisma does not map
 * it onto the P2002 of a unique index. Code that only catches P2002 turns a
 * lost race into a 500.
 */
const MARKER = "__fr16_overlap_test__";
const BUSINESS = "biz_alpha";
const DATE = new Date("2027-03-03");

let issueId = "";
let pageId = "";
let publicationA = "";
let publicationB = "";
let advertisementId = "";
let shapeId = "";
let orderId = "";

beforeAll(async () => {
  const paper = await basePrisma.newspaper.findUniqueOrThrow({ where: { id: "paper_alpha" } });
  const shape = await basePrisma.adShape.findFirstOrThrow({
    where: { newspaper_id: "paper_alpha", name: { contains: "רבע" } },
  });
  shapeId = shape.id;

  const ad = await basePrisma.advertisement.create({
    data: {
      business_id: BUSINESS,
      customer_id: "cust_alpha_1",
      uploaded_by_user_id: "usr_admin",
      name: `${MARKER}.pdf`,
      file_type: "pdf",
      file_size: 10,
      file_url: `${BUSINESS}/ads/${MARKER}/current.pdf`,
      original_file_url: `${BUSINESS}/ads/${MARKER}/current.pdf`,
      validation_status: "passed",
    },
  });
  advertisementId = ad.id;

  const order = await basePrisma.adOrder.create({
    data: {
      business_id: BUSINESS,
      customer_id: "cust_alpha_1",
      status: "approved",
      approved_at: new Date(),
      number: await nextOrderNumber(BUSINESS),
    },
  });
  orderId = order.id;

  const publications = await Promise.all(
    [0, 1].map(() =>
      basePrisma.publication.create({
        data: {
          business_id: BUSINESS,
          order_id: order.id,
          customer_id: "cust_alpha_1",
          newspaper_id: "paper_alpha",
          ad_shape_id: shape.id,
          advertisement_id: ad.id,
          publication_date: DATE,
          price: 1,
          source: "internal",
          status: "ready_for_layout",
        },
      }),
    ),
  );
  publicationA = publications[0]!.id;
  publicationB = publications[1]!.id;

  const issue = await basePrisma.issue.create({
    data: {
      business_id: BUSINESS,
      newspaper_id: "paper_alpha",
      issue_date: DATE,
      status: "in_layout",
      page_size: paper.page_size,
      custom_width_mm: paper.custom_width_mm,
      custom_height_mm: paper.custom_height_mm,
      margin: paper.margin,
      columns: paper.columns,
      row_height_mm: paper.row_height_mm,
      gutter_mm: paper.gutter_mm,
    },
  });
  issueId = issue.id;

  const page = await basePrisma.issuePage.create({
    data: { issue_id: issue.id, page_type_id: "pt_inner", page_number: 1 },
  });
  pageId = page.id;
});

// Every test starts on an empty page. Not afterEach: a test that fails half
// way through cleans up nothing, and the next one still has to start from a
// page it can reason about.
beforeEach(async () => {
  if (issueId) await basePrisma.placement.deleteMany({ where: { issue_id: issueId } });
});

afterAll(async () => {
  await basePrisma.placement.deleteMany({ where: { issue_id: issueId } });
  await basePrisma.issuePage.deleteMany({ where: { issue_id: issueId } });
  await basePrisma.issue.deleteMany({ where: { id: issueId } });
  await basePrisma.publication.deleteMany({ where: { order_id: orderId } });
  await basePrisma.adOrder.deleteMany({ where: { id: orderId } });
  await basePrisma.advertisement.deleteMany({ where: { id: advertisementId } });
});

const place = (publicationId: string, rect: { col: number; row: number }) =>
  basePrisma.placement.create({
    data: {
      issue_id: issueId,
      issue_page_id: pageId,
      publication_id: publicationId,
      advertisement_id: advertisementId,
      ad_shape_id: shapeId,
      col: rect.col,
      row: rect.row,
      cols: 4,
      rows: 4,
      status: "placed",
    },
  });

describe("placement_no_overlap (EXCLUDE USING gist)", () => {
  it("lets exactly one of two simultaneous placements have the space", async () => {
    const results = await Promise.allSettled([
      place(publicationA, { col: 0, row: 0 }),
      place(publicationB, { col: 2, row: 2 }),
    ]);

    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);

    // The failure the data layer has to translate — and NOT Prisma's P2002.
    const error = (lost[0] as PromiseRejectedResult).reason as Error & { code?: string };
    expect(error.message).toContain("23P01");
    expect(error.code).not.toBe("P2002");
    // The predicate the data layer actually branches on, asserted against a
    // real error rather than a hand-built one.
    expect(isExclusionViolation(error)).toBe(true);
  });

  it("allows two placements that touch at the edge", async () => {
    await place(publicationA, { col: 0, row: 0 });
    await expect(place(publicationB, { col: 4, row: 0 })).resolves.toBeTruthy();
  });

  it("frees the space again when a placement is removed rather than deleted", async () => {
    const first = await place(publicationA, { col: 0, row: 0 });
    await basePrisma.placement.update({ where: { id: first.id }, data: { status: "removed" } });

    // The constraint is partial: a removed row occupies nothing, and is still
    // there as the record of having been placed.
    await expect(place(publicationB, { col: 0, row: 0 })).resolves.toBeTruthy();
    expect(await basePrisma.placement.count({ where: { issue_id: issueId } })).toBe(2);
  });
});

describe("placement_publication_unique (partial unique index)", () => {
  it("refuses a second placement of one publication in one issue", async () => {
    await place(publicationA, { col: 0, row: 0 });

    await expect(place(publicationA, { col: 10, row: 0 })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("admits the second one once the first is marked as an approved override", async () => {
    const first = await place(publicationA, { col: 0, row: 0 });
    await basePrisma.placement.update({
      where: { id: first.id },
      data: { duplicate_override_approved: true },
    });

    await expect(place(publicationA, { col: 10, row: 0 })).resolves.toBeTruthy();
  });
});
