import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { basePrisma, tenantDb, MissingTenantScopeError } from "./db";

/**
 * The most important test in stage 01: proof that the Prisma extension really
 * scopes every query, not just the ones a developer remembered to filter.
 *
 * It runs against the dev database (docker compose) and cleans up after itself.
 */
const ALPHA = "biz_alpha";
const BETA = "biz_beta";
const MARKER = "__tenant_test__";

let alphaLogId = "";
let betaLogId = "";

beforeAll(async () => {
  // AuditLog is the only tenant-scoped entity that exists in stage 01, so it
  // stands in for every model the extension guards.
  const a = await basePrisma.auditLog.create({
    data: {
      business_id: ALPHA,
      user_id: "usr_admin",
      action: "approve_order",
      target_type: MARKER,
      target_id: "alpha-row",
    },
  });
  const b = await basePrisma.auditLog.create({
    data: {
      business_id: BETA,
      user_id: "usr_beta_admin",
      action: "approve_order",
      target_type: MARKER,
      target_id: "beta-row",
    },
  });
  alphaLogId = a.id;
  betaLogId = b.id;
});

afterAll(async () => {
  await basePrisma.auditLog.deleteMany({ where: { target_type: MARKER } });
});

describe("tenant scoping (FR-1, conventions.md §2)", () => {
  it("findMany returns only the active business's rows", async () => {
    const rows = await tenantDb(ALPHA).auditLog.findMany({ where: { target_type: MARKER } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.target_id).toBe("alpha-row");
  });

  it("findFirst cannot see the other business's row even when asked by id", async () => {
    const leaked = await tenantDb(ALPHA).auditLog.findFirst({ where: { id: betaLogId } });
    expect(leaked).toBeNull();
  });

  it("findUnique by id is scoped too — the classic leak", async () => {
    const leaked = await tenantDb(ALPHA).auditLog.findUnique({ where: { id: betaLogId } });
    expect(leaked).toBeNull();
  });

  it("count is scoped", async () => {
    const n = await tenantDb(BETA).auditLog.count({ where: { target_type: MARKER } });
    expect(n).toBe(1);
  });

  it("create injects business_id without the caller passing it", async () => {
    const created = await tenantDb(BETA).auditLog.create({
      data: {
        user_id: "usr_beta_admin",
        action: "close_issue",
        target_type: MARKER,
        target_id: "injected",
      } as never,
    });
    expect(created.business_id).toBe(BETA);
  });

  it("deleteMany cannot reach across the tenant boundary", async () => {
    const res = await tenantDb(ALPHA).auditLog.deleteMany({ where: { id: betaLogId } });
    expect(res.count).toBe(0);

    const survivor = await basePrisma.auditLog.findUnique({ where: { id: betaLogId } });
    expect(survivor).not.toBeNull();
  });

  it("the alpha row is still reachable from alpha — the scope is not just blocking everything", async () => {
    const own = await tenantDb(ALPHA).auditLog.findUnique({ where: { id: alphaLogId } });
    expect(own?.target_id).toBe("alpha-row");
  });

  it("refuses to build a client without a business", () => {
    expect(() => tenantDb("")).toThrow(MissingTenantScopeError);
  });
});
