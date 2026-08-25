import { afterAll, describe, expect, it } from "vitest";
import { basePrisma } from "./db";
import { createPublicationsForOrder } from "./orders";

/**
 * FR-17 / conventions.md §7 rule 1, asserted against what is actually stored.
 *
 * The browser version of this walked four screens and two sign-ins and spent
 * its whole budget on route compilation. The rule itself is about a stored
 * number, so it is checked where the number lives: approve, move the price
 * list, and read the publication back.
 */
const MARKER = "__fr17_test__";
const BUSINESS = "biz_alpha";

afterAll(async () => {
  await basePrisma.publication.deleteMany({ where: { order: { rejection_reason: MARKER } } });
  await basePrisma.adOrderItem.deleteMany({ where: { order: { rejection_reason: MARKER } } });
  await basePrisma.adOrder.deleteMany({ where: { rejection_reason: MARKER } });
});

describe("an approved price is frozen (FR-17)", () => {
  it("survives a later change to the price list", async () => {
    const shape = await basePrisma.adShape.findFirstOrThrow({
      where: { newspaper_id: "paper_alpha" },
    });
    const pageType = await basePrisma.pageType.findFirstOrThrow({ where: { id: "pt_inner" } });

    // A base price of 1500 at the moment of sale.
    await basePrisma.priceRule.upsert({
      where: {
        newspaper_id_page_type_id_ad_shape_id: {
          newspaper_id: "paper_alpha",
          page_type_id: pageType.id,
          ad_shape_id: shape.id,
        },
      },
      update: { price: 1500 },
      create: {
        newspaper_id: "paper_alpha",
        page_type_id: pageType.id,
        ad_shape_id: shape.id,
        price: 1500,
      },
    });

    const order = await basePrisma.adOrder.create({
      data: {
        business_id: BUSINESS,
        customer_id: "cust_alpha_1",
        source: "internal",
        status: "rejected",
        // The marker rides on a column that exists, so cleanup can find it.
        rejection_reason: MARKER,
        total_price: 1500,
      },
    });

    const item = await basePrisma.adOrderItem.create({
      data: {
        order_id: order.id,
        newspaper_id: "paper_alpha",
        page_type_id: pageType.id,
        ad_shape_id: shape.id,
        publication_date: new Date("2026-12-01"),
        price: 1500,
      },
    });

    await basePrisma.$transaction(async (tx) => {
      await createPublicationsForOrder(
        tx,
        {
          id: order.id,
          business_id: BUSINESS,
          customer_id: "cust_alpha_1",
          source: "internal",
        },
        [item],
      );
    });

    const before = await basePrisma.publication.findUniqueOrThrow({
      where: { order_item_id: item.id },
    });
    expect(Number(before.price)).toBe(1500);

    // The price list moves afterwards — by a lot.
    await basePrisma.priceRule.update({
      where: {
        newspaper_id_page_type_id_ad_shape_id: {
          newspaper_id: "paper_alpha",
          page_type_id: pageType.id,
          ad_shape_id: shape.id,
        },
      },
      data: { price: 9999 },
    });

    const after = await basePrisma.publication.findUniqueOrThrow({
      where: { order_item_id: item.id },
    });
    expect(Number(after.price)).toBe(1500);
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
  });

  it("is idempotent — approving twice creates one publication, not two", async () => {
    const shape = await basePrisma.adShape.findFirstOrThrow({
      where: { newspaper_id: "paper_alpha" },
    });

    const order = await basePrisma.adOrder.create({
      data: {
        business_id: BUSINESS,
        customer_id: "cust_alpha_1",
        source: "internal",
        status: "rejected",
        rejection_reason: MARKER,
        total_price: 700,
      },
    });
    const item = await basePrisma.adOrderItem.create({
      data: {
        order_id: order.id,
        newspaper_id: "paper_alpha",
        page_type_id: "pt_inner",
        ad_shape_id: shape.id,
        publication_date: new Date("2026-12-08"),
        price: 700,
      },
    });

    const orderRef = {
      id: order.id,
      business_id: BUSINESS,
      customer_id: "cust_alpha_1",
      source: "internal" as const,
    };

    const first = await basePrisma.$transaction((tx) =>
      createPublicationsForOrder(tx, orderRef, [item]),
    );
    const second = await basePrisma.$transaction((tx) =>
      createPublicationsForOrder(tx, orderRef, [item]),
    );

    expect(first).toBe(1);
    // The unique index on order_item_id is what makes the second call a no-op.
    expect(second).toBe(0);
    expect(await basePrisma.publication.count({ where: { order_id: order.id } })).toBe(1);
  });
});
