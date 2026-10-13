/**
 * Which models are scoped to a business, and how (conventions.md §2).
 *
 * This file is data, not logic, so that the extension in db.ts and the tests
 * both read the same list. A model missing from here is silently unscoped —
 * that is the failure mode this project cares most about, so every new model
 * must be classified here in the same commit that adds it.
 */

/** Models that carry business_id directly. */
export const DIRECT_TENANT_MODELS = [
  "Customer",
  "Newspaper",
  "AdOrder",
  "Publication",
  "Advertisement",
  "Issue",
  "Payment",
  "AuditLog",
  "UserMembership",
  "RolePermission",
  "BusinessSettings",
  "TearSheetDelivery",
] as const;

/**
 * Models reached through a parent that holds business_id. The value is the
 * relation path from the model to that parent. Fetching one of these by id
 * alone is forbidden — the extension nests the scope through the relation.
 */
export const INDIRECT_TENANT_MODELS: Record<string, string> = {
  PageType: "newspaper",
  AdShape: "newspaper",
  AllowedAdShape: "page_type",
  PageReservation: "page_type",
  PriceRule: "newspaper",
  AdPackage: "newspaper",
  // The relation field on AdOrderItem is `order` — the registry names the
  // relation to walk, not the model it points at.
  AdOrderItem: "order",
  IssuePage: "issue",
  Placement: "issue",
  IssuePageReservation: "issue_page",
  Reminder: "publication",
  PdfGenerationLog: "issue",
  CustomerContact: "customer",
};

/**
 * There are no global models.
 *
 * Until 24/08/2026 `AdShape` was the one documented exception: ad shapes were
 * shared by every business. A product change made the shape catalogue something
 * each newspaper owns and edits, so it became tenant-scoped through its
 * newspaper like PageType. This list stays here, empty, as the record of that
 * reversal — see conventions.md §2.
 */
export const GLOBAL_MODELS = [] as const;

/** Models with no tenant dimension at all — auth-level entities. */
export const UNSCOPED_MODELS = ["Business", "User"] as const;

export function isDirectTenantModel(model: string): boolean {
  return (DIRECT_TENANT_MODELS as readonly string[]).includes(model);
}

export function isIndirectTenantModel(model: string): boolean {
  return Object.hasOwn(INDIRECT_TENANT_MODELS, model);
}
