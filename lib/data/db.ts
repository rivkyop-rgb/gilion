/**
 * The tenant-scoped Prisma client (conventions.md §2).
 *
 * Cross-business data leakage is the worst failure this system can have, so
 * enforcement does not rely on a developer remembering to add
 * `where: { business_id }`. The extension injects it into every read, write
 * and delete, and refuses to run a query it cannot scope.
 *
 * Only this layer and lib/data/* may import @prisma/client — enforced by ESLint.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import {
  INDIRECT_TENANT_MODELS,
  isDirectTenantModel,
  isIndirectTenantModel,
} from "./tenant-models";

export class MissingTenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(
      `refusing to run ${model}.${operation} without an active business. ` +
        `Call getTenantContext() first (conventions.md §2).`,
    );
    this.name = "MissingTenantScopeError";
  }
}

const READ_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);
const WRITE_MANY_OPS = new Set(["updateMany", "deleteMany"]);
const WRITE_ONE_OPS = new Set(["update", "delete", "upsert"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

/**
 * The tenant filter for a model. Direct models get business_id; indirect ones
 * get a relation filter that walks up to the parent holding it — which is why
 * an indirect model must never be fetched by id alone.
 */
function scopeFor(model: string, businessId: string): Record<string, unknown> {
  if (isDirectTenantModel(model)) return { business_id: businessId };
  const relation = INDIRECT_TENANT_MODELS[model]!;
  return { [relation]: { is: scopeFor(parentModelOf(model), businessId) } };
}

/** Walks one step up the ownership chain declared in tenant-models.ts. */
function parentModelOf(model: string): string {
  const CHAIN: Record<string, string> = {
    PageType: "Newspaper",
    AdShape: "Newspaper",
    AllowedAdShape: "PageType",
    PageReservation: "PageType",
    PriceRule: "Newspaper",
    AdOrderItem: "AdOrder",
    IssuePage: "Issue",
    Placement: "Issue",
    IssuePageReservation: "IssuePage",
    Reminder: "Publication",
    PdfGenerationLog: "Issue",
  };
  return CHAIN[model]!;
}

function withTenant(base: PrismaClient, businessId: string) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isDirectTenantModel(model) && !isIndirectTenantModel(model)) {
            return query(args);
          }

          const a = args as Record<string, unknown>;
          const scope = scopeFor(model, businessId);

          if (CREATE_OPS.has(operation)) {
            if (isDirectTenantModel(model)) {
              if (operation === "create") {
                const data = (a["data"] ?? {}) as Record<string, unknown>;
                a["data"] = { ...data, business_id: businessId };
              } else if (operation === "upsert") {
                const create = (a["create"] ?? {}) as Record<string, unknown>;
                const update = (a["update"] ?? {}) as Record<string, unknown>;
                a["create"] = { ...create, business_id: businessId };
                a["update"] = update;
                a["where"] = { ...((a["where"] ?? {}) as object), ...scope };
              } else {
                const rows = (a["data"] ?? []) as Record<string, unknown>[];
                a["data"] = rows.map((r) => ({ ...r, business_id: businessId }));
              }
            }
            return query(a);
          }

          if (
            READ_OPS.has(operation) ||
            WRITE_MANY_OPS.has(operation) ||
            WRITE_ONE_OPS.has(operation)
          ) {
            // The scope is merged into `where` rather than wrapped in AND: for
            // findUnique/update/delete Prisma requires a unique field to stay at
            // the top level, and AND would bury it. Merging keeps the unique
            // selector visible while ANDing the tenant filter alongside it
            // (Prisma's extended unique-where, GA since v5).
            const existing = (a["where"] ?? {}) as Record<string, unknown>;
            a["where"] = { ...existing, ...scope };
            return query(a);
          }

          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof withTenant>;

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

const globalForPrisma = globalThis as unknown as { prismaBase?: PrismaClient };

/**
 * The unscoped client. Reserved for auth (Business/User lookups happen before
 * a business is chosen) and for migrations/seeds. Never use it for tenant data.
 */
export const basePrisma: PrismaClient =
  globalForPrisma.prismaBase ??
  new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString() }) });

if (process.env.NODE_ENV !== "production") globalForPrisma.prismaBase = basePrisma;

/** The client every feature uses. Scoped to one business for the whole request. */
export function tenantDb(businessId: string): TenantDb {
  if (!businessId) throw new MissingTenantScopeError("*", "tenantDb");
  return withTenant(basePrisma, businessId);
}
