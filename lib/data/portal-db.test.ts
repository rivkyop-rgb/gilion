import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePrisma } from "./db";
import { customerDb, PortalModelRefusedError } from "./portal-db";

/**
 * The second wall (09-customer-portal.md §מודל נתונים). Runs against the dev
 * database with seeded customers and cleans up after itself.
 */
const MARKER = "__portal_db_test__";
const A = { businessId: "biz_alpha", customerId: "cust_alpha_1" };
const OTHER = "cust_alpha_3";

let mine = "";
let theirs = "";

beforeAll(async () => {
  const make = (customer_id: string) =>
    basePrisma.advertisement.create({
      data: {
        business_id: "biz_alpha",
        customer_id,
        uploaded_by_user_id: "usr_admin",
        name: MARKER,
        file_type: "png",
        file_size: 1,
        file_url: "",
        original_file_url: "",
      },
    });
  mine = (await make(A.customerId)).id;
  theirs = (await make(OTHER)).id;
});

afterAll(async () => {
  await basePrisma.advertisement.deleteMany({ where: { name: MARKER } });
});

describe("customerDb — business AND customer on every query", () => {
  it("lists only the customer's own rows", async () => {
    const rows = await customerDb(A).advertisement.findMany({ where: { name: MARKER } });
    expect(rows.map((r) => r.id)).toEqual([mine]);
  });

  it("a lookup by another customer's id finds nothing — findFirst and findUnique", async () => {
    expect(await customerDb(A).advertisement.findFirst({ where: { id: theirs } })).toBeNull();
    expect(await customerDb(A).advertisement.findUnique({ where: { id: theirs } })).toBeNull();
  });

  it("looking up another Customer by id does not quietly return your own", async () => {
    expect(await customerDb(A).customer.findUnique({ where: { id: OTHER } })).toBeNull();
    expect((await customerDb(A).customer.findUnique({ where: { id: A.customerId } }))?.id).toBe(
      A.customerId,
    );
  });

  it("cannot update or delete another customer's row", async () => {
    const u = await customerDb(A).advertisement.updateMany({
      where: { id: theirs },
      data: { name: "x" },
    });
    const d = await customerDb(A).advertisement.deleteMany({ where: { id: theirs } });
    expect(u.count + d.count).toBe(0);
  });

  it("a create is stamped with the scope's customer, whatever the caller passed", async () => {
    const row = await customerDb(A).advertisement.create({
      data: {
        customer_id: OTHER,
        uploaded_by_user_id: "usr_admin",
        name: MARKER,
        file_type: "png",
        file_size: 1,
        file_url: "",
        original_file_url: "",
      } as never,
    });
    expect(row.customer_id).toBe(A.customerId);
    expect(row.business_id).toBe("biz_alpha");
  });

  it("refuses payments outright (FR-18) and anything not listed", async () => {
    await expect(customerDb(A).payment.findMany()).rejects.toThrow(PortalModelRefusedError);
    await expect(customerDb(A).issue.findMany()).rejects.toThrow(PortalModelRefusedError);
    await expect(customerDb(A).auditLog.findMany()).rejects.toThrow(PortalModelRefusedError);
  });

  it("reads the catalogue but cannot write it", async () => {
    expect(Array.isArray(await customerDb(A).newspaper.findMany())).toBe(true);
    await expect(customerDb(A).newspaper.updateMany({ data: { name: "x" } })).rejects.toThrow(
      PortalModelRefusedError,
    );
  });
});
