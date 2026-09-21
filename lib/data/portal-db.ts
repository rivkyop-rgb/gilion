/**
 * The portal's database client — the tenant client with a second wall inside.
 *
 * tenantDb() already confines every query to one business. Inside a business,
 * though, every advertiser's requests sit side by side, and the portal serves
 * advertisers. So this client adds `customer_id` to every query on what a
 * customer owns, on top of the business filter the tenant extension adds
 * (09-customer-portal.md §מודל נתונים: "שתי שכבות, לא אחת").
 *
 * It is fail-closed. A model is reachable only if it is listed below, either as
 * the customer's own or as the business's catalogue that every customer may
 * read. Payments are on neither list and never will be (FR-18): a portal query
 * that reaches for them throws rather than returning an empty page that looks
 * like an answer.
 */
import { tenantDb } from "./db";

export class PortalModelRefusedError extends Error {
  constructor(model: string, operation: string) {
    super(`the portal may not run ${model}.${operation} (FR-9, FR-18)`);
    this.name = "PortalModelRefusedError";
  }
}

/** What a customer owns, and how a row of it names its customer. */
function ownership(model: string, customerId: string): Record<string, unknown> | null {
  switch (model) {
    case "AdOrder":
    case "Advertisement":
    case "Publication":
      return { customer_id: customerId };
    case "AdOrderItem":
      return { order: { is: { customer_id: customerId } } };
    case "Customer":
      return { id: customerId };
    default:
      return null;
  }
}

/**
 * The business's catalogue: what can be ordered, never who ordered it. Read
 * only — a customer changes none of it.
 */
const CATALOGUE = new Set([
  "Newspaper",
  "PageType",
  "AdShape",
  "AllowedAdShape",
  "PriceRule",
  "BusinessSettings",
]);

const READS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
]);
const CREATES = new Set(["create", "createMany", "createManyAndReturn"]);

export type CustomerDbScope = { businessId: string; customerId: string };

export function customerDb(scope: CustomerDbScope) {
  if (!scope.customerId) throw new PortalModelRefusedError("*", "customerDb");

  return tenantDb(scope.businessId).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (CATALOGUE.has(model)) {
            if (!READS.has(operation)) throw new PortalModelRefusedError(model, operation);
            return query(args);
          }

          const own = ownership(model, scope.customerId);
          if (!own) throw new PortalModelRefusedError(model, operation);

          const a = args as Record<string, unknown>;
          if (CREATES.has(operation)) {
            // A create names its customer from the scope, whatever the caller
            // put there. Only the models that carry the column directly can be
            // created this way; the rest are created through their parent.
            if (!("customer_id" in own)) throw new PortalModelRefusedError(model, operation);
            if (operation === "create") {
              a["data"] = { ...((a["data"] ?? {}) as object), customer_id: scope.customerId };
            } else {
              const rows = (a["data"] ?? []) as Record<string, unknown>[];
              a["data"] = rows.map((r) => ({ ...r, customer_id: scope.customerId }));
            }
            return query(a);
          }

          if (operation === "upsert") throw new PortalModelRefusedError(model, operation);

          // The unique selector stays at the top level, where findUnique and
          // update need it (as in db.ts), and ownership is ANDed beside it
          // rather than spread over it. Spreading would let `{ id }` on
          // Customer overwrite the caller's id with the customer's own — a
          // lookup of someone else would quietly return yourself.
          const where = (a["where"] ?? {}) as Record<string, unknown>;
          const and = where["AND"];
          a["where"] = {
            ...where,
            AND: [...(Array.isArray(and) ? and : and ? [and] : []), own],
          };
          return query(a);
        },
      },
    },
  });
}
